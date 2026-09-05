# shellcheck shell=sh
# Tricky Store INI helpers. Tricky Store owns configuration migration.

_ini_read_targets() {
  [ -f "$1" ] || return 0
  awk '
    {
      line = $0
      sub(/[;#].*$/, "", line)
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", line)
      if (line ~ /^\[[^][]+\]$/) { section = line; next }
      if (section == "[target]" && line ~ /^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)*[!?]?$/)
        print line
    }
  ' "$1"
}

# Retain the watched inode, as with the TOML backend.
_ini_commit() {
  [ -f "$1" ] && [ -f "$2" ] || return 1
  rm -f "$1.bak"
  cp -p "$1" "$1.bak" || return 1
  _ksm_inplace_from "$2" "$1" || {
    _ksm_inplace_from "$1.bak" "$1" || return 1
    return 1
  }
}

_ini_write_targets() (
  [ -f "$1" ] && [ -f "$2" ] || return 1
  _ini_tmp="$1.targets.$$"
  trap 'rm -f "$_ini_tmp"' 0
  awk -v src="$2" '
    function package(s) { return s ~ /^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)*[!?]?$/ }
    function emit(   i) { for (i = 1; i <= n; i++) print want[order[i]] }
    BEGIN {
      while ((status = getline line < src) > 0) {
        sub(/\r$/, "", line)
        if (line == "") continue
        if (!package(line)) { invalid = 1; exit 1 }
        base = line
        sub(/[!?]$/, "", base)
        if (!(base in want)) order[++n] = base
        want[base] = line
      }
      close(src)
      if (status < 0) { invalid = 1; exit 1 }
    }
    {
      line = $0
      sub(/[;#].*$/, "", line)
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", line)
      if (line ~ /^\[[^][]+\]$/) {
        section = line
        print
        if (section == "[target]" && !found) { emit(); found = 1 }
        next
      }
      if (section == "[target]" && package(line)) {
        if (match($0, /[;#]/)) print substr($0, RSTART)
        next
      }
      print
    }
    END {
      if (invalid) exit 1
      if (!found) { print "\n[target]"; emit() }
    }
  ' "$1" > "$_ini_tmp" || return 1
  _ini_commit "$1" "$_ini_tmp"
)

_ini_get_boot_patch() {
  [ -f "$1" ] || return 1
  awk '
    {
      line = $0
      sub(/[;#].*$/, "", line)
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", line)
      if (line ~ /^\[[^][]+\]$/) { section = line; next }
      if (section == "[default_policy]" && line ~ /^boot_patch[[:space:]]*=/) {
        sub(/^[^=]*=[[:space:]]*/, "", line)
        value = line
      }
    }
    END {
      if (value ~ /^[0-9]+$/ && length(value) == 8)
        value = substr(value, 1, 4) "-" substr(value, 5, 2) "-" substr(value, 7, 2)
      print (value == "" ? "no" : value)
    }
  ' "$1"
}

# Convert the existing date interface to native default-policy fields.
_ini_set_patch() (
  [ -f "$1" ] || return 1
  case "$2" in [0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]) ;; *) return 1 ;; esac
  _ini_boot=$(printf '%s' "$2" | tr -d '-')
  _ini_os=$(printf '%s' "$_ini_boot" | cut -c 1-6)
  _ini_vendor=$(getprop ro.vendor.build.security_patch 2>/dev/null) || _ini_vendor=""
  if [ -z "$_ini_vendor" ] && [ -f /vendor/build.prop ]; then
    _ini_vendor=$(sed -n 's/^ro.vendor.build.security_patch=//p' /vendor/build.prop | head -1 | tr -d '[:space:]')
  fi
  case "$_ini_vendor" in
    [0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]) _ini_vendor=$(printf '%s' "$_ini_vendor" | tr -d '-') ;;
    *) _ini_vendor="$_ini_boot" ;;
  esac
  _ini_tmp="$1.patch.$$"
  trap 'rm -f "$_ini_tmp"' 0
  awk -v os="$_ini_os" -v boot="$_ini_boot" -v vendor="$_ini_vendor" '
    function emit() {
      if (!seen["os_patch"]) print "os_patch=" os
      if (!seen["boot_patch"]) print "boot_patch=" boot
      if (!seen["vendor_patch"]) print "vendor_patch=" vendor
      seen["os_patch"] = seen["boot_patch"] = seen["vendor_patch"] = 1
    }
    {
      line = $0
      sub(/[;#].*$/, "", line)
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", line)
      if (line ~ /^\[[^][]+\]$/) {
        if (section == "[default_policy]") emit()
        section = line
        if (section == "[default_policy]") found = 1
        print
        next
      }
      if (section == "[default_policy]" && line ~ /^(os_patch|boot_patch|vendor_patch)[[:space:]]*=/) {
        key = line
        sub(/[[:space:]]*=.*$/, "", key)
        comment = match($0, /[;#]/) ? " " substr($0, RSTART) : ""
        print key "=" (key == "os_patch" ? os : (key == "boot_patch" ? boot : vendor)) comment
        seen[key] = 1
        next
      }
      print
    }
    END {
      if (!found) print "\n[default_policy]"
      emit()
    }
  ' "$1" > "$_ini_tmp" || return 1
  _ini_commit "$1" "$_ini_tmp"
)
