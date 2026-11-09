# shellcheck shell=sh
# Surface a failed downloader's stderr instead of hiding it. Stderr is used so
# callers that capture stdout (catalog downloads) do not get diagnostics mixed
# into their payload.
_dl_show_error() {
    [ -s "$1" ] || return 0
    printf '[NET] %s failed: %s\n' "$2" "$(tr '\n' ' ' < "$1")" >&2
    : > "$1"
}

download() {
    _dl_url="$1" _dl_output="$2" _dl_sha256="$3" _dl_oldpath="$PATH"
    PATH="/data/adb/ap/bin:/data/adb/ksu/bin:/data/adb/magisk:/data/data/com.termux/files/usr/bin:$PATH"
    _dl_tmp="" _dl_code=1 _dl_try=0 _dl_ua="Specter/1.0"
    _dl_err="${SPECTER_DIR:-/data/adb/specter}/.dl_err_$$"
    _dl_https=0 _dl_nocurl=0
    case "$_dl_url" in https://*) _dl_https=1 ;; esac

    log_d "NET" "Downloading $_dl_url"

    if [ -z "$_dl_output" ]; then
        _dl_tmp=$(mktemp 2>/dev/null || echo "${SPECTER_DIR:-/data/local/tmp}/.specter_dl_${$}_$(date +%s 2>/dev/null || busybox date +%s)")
        _dl_output="$_dl_tmp"
    fi

    for _dl_try in 1 2 3; do
        if command -v curl >/dev/null 2>&1 && curl --version >/dev/null 2>&1; then
            _dl_proto=""
            case "$_dl_url" in https://*) _dl_proto="=https" ;; esac
            if curl --connect-timeout 10 -fLs ${_dl_proto:+--proto-redir} ${_dl_proto:+"$_dl_proto"} -o "$_dl_output" -A "$_dl_ua" "$_dl_url" 2>"$_dl_err"; then
                [ -s "$_dl_output" ] && { _dl_code=0; break; }
            else
                _dl_show_error "$_dl_err" "curl"
            fi
        elif [ "$_dl_https" = "1" ] && [ "$_dl_nocurl" = "0" ]; then
            printf '[NET] curl not found; falling back to BusyBox wget for HTTPS: %s\n' "$_dl_url" >&2
            _dl_nocurl=1
        fi
        # BusyBox wget is the only HTTPS client guaranteed on-device: Android
        # images do not ship curl.
        if busybox wget -T 10 -qO "$_dl_output" -U "$_dl_ua" "$_dl_url" 2>"$_dl_err"; then
            [ -s "$_dl_output" ] && { _dl_code=0; break; }
        else
            _dl_show_error "$_dl_err" "busybox wget"
        fi
        sleep 1
    done

    if [ "$_dl_code" -eq 0 ]; then
        log_d "NET" "Downloaded ($(_dl_stat "$_dl_output" 2>/dev/null || echo '?')) bytes"
        if [ -n "$_dl_sha256" ]; then
            _dl_sum=$(sha256sum "$_dl_output" 2>/dev/null | cut -d' ' -f1)
            if [ "$_dl_sum" != "$_dl_sha256" ]; then
                log_e "NET" "SHA256 mismatch for $_dl_url"
                rm -f "$_dl_output" "$_dl_err"
                PATH="$_dl_oldpath"
                unset _dl_url _dl_output _dl_sha256 _dl_oldpath _dl_tmp _dl_code _dl_try _dl_sum _dl_ua _dl_err _dl_https _dl_nocurl
                return 1
            fi
            log_d "NET" "SHA256 verified"
        fi
    else
        log_w "NET" "Download failed after 3 attempts: $_dl_url"
    fi

    if [ -n "$_dl_tmp" ]; then
        [ "$_dl_code" -eq 0 ] && { cat "$_dl_tmp" 2>/dev/null || busybox cat "$_dl_tmp"; }
        rm -f "$_dl_tmp"
    fi

    rm -f "$_dl_err"
    PATH="$_dl_oldpath"
    _dl_rc=$_dl_code
    unset _dl_url _dl_output _dl_sha256 _dl_oldpath _dl_tmp _dl_code _dl_try _dl_sum _dl_ua _dl_proto _dl_err _dl_https _dl_nocurl
    return $_dl_rc
}

_dl_stat() { stat -c%s "$1" 2>/dev/null || wc -c < "$1" 2>/dev/null || echo "?"; }

check_network() {
    _cn_oldpath="$PATH"
    PATH="/data/adb/ap/bin:/data/adb/ksu/bin:/data/adb/magisk:/data/data/com.termux/files/usr/bin:$PATH"

    ping -c1 -W2 "1.1.1.1" >/dev/null 2>&1 && PATH="$_cn_oldpath" && unset _cn_oldpath && return 0

    if busybox wget -T 5 -qO /dev/null "https://clients3.google.com/generate_204" 2>/dev/null; then
        PATH="$_cn_oldpath"; unset _cn_oldpath; return 0
    fi
    if command -v curl >/dev/null 2>&1 && curl --version >/dev/null 2>&1; then
        curl --connect-timeout 5 -sI "https://clients3.google.com/generate_204" >/dev/null 2>&1 && PATH="$_cn_oldpath" && unset _cn_oldpath && return 0
    fi

    PATH="$_cn_oldpath"
    unset _cn_oldpath
    return 1
}
