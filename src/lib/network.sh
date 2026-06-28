# shellcheck shell=sh
download() {
    _dl_url="$1" _dl_output="$2" _dl_sha256="$3" _dl_oldpath="$PATH"
    PATH="/data/adb/ap/bin:/data/adb/ksu/bin:/data/adb/magisk:/data/data/com.termux/files/usr/bin:$PATH"
    _dl_tmp="" _dl_code=1 _dl_try=0 _dl_ua="Specter/1.0"

    log_d "NET" "Downloading $_dl_url"

    if [ -z "$_dl_output" ]; then
        _dl_tmp=$(mktemp 2>/dev/null || echo "/data/local/tmp/.specter_dl_${$}_$(date +%s)")
        _dl_output="$_dl_tmp"
    fi

    for _dl_try in 1 2 3; do
        if busybox wget -T 10 --no-check-certificate -qO "$_dl_output" -U "$_dl_ua" "$_dl_url" 2>/dev/null; then
            [ -s "$_dl_output" ] && { _dl_code=0; break; }
        fi
        if command -v curl >/dev/null 2>&1 && curl --version >/dev/null 2>&1; then
            curl --connect-timeout 10 -Ls -o "$_dl_output" -A "$_dl_ua" "$_dl_url" 2>/dev/null && [ -s "$_dl_output" ] && { _dl_code=0; break; }
        fi
        sleep 1
    done

    if [ "$_dl_code" -eq 0 ]; then
        log_d "NET" "Downloaded ($(_dl_stat "$_dl_output" 2>/dev/null || echo '?')) bytes"
        if [ -n "$_dl_sha256" ]; then
            _dl_sum=$(sha256sum "$_dl_output" 2>/dev/null | cut -d' ' -f1)
            if [ "$_dl_sum" != "$_dl_sha256" ]; then
                log_e "NET" "SHA256 mismatch for $_dl_url"
                rm -f "$_dl_output"
                PATH="$_dl_oldpath"
                unset _dl_url _dl_output _dl_sha256 _dl_oldpath _dl_tmp _dl_code _dl_try _dl_sum _dl_ua
                return 1
            fi
            log_d "NET" "SHA256 verified"
        fi
    else
        log_w "NET" "Download failed after 3 attempts: $_dl_url"
    fi

    if [ -n "$_dl_tmp" ]; then
        [ "$_dl_code" -eq 0 ] && cat "$_dl_tmp"
        rm -f "$_dl_tmp"
    fi

    PATH="$_dl_oldpath"
    _dl_rc=$_dl_code
    unset _dl_url _dl_output _dl_sha256 _dl_oldpath _dl_tmp _dl_code _dl_try _dl_sum _dl_ua
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
