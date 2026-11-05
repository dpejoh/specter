plan "HMA-OSS config generation and merge"

_hma_list_default="$REPO_ROOT/src/config/hma-hide-list.txt"
assert_file_exists "hide list: default exists" "$_hma_list_default"
assert_contains "hide list: Duck LSPosed entry" "$(cat "$_hma_list_default")" "org.lsposed.manager"
assert_contains "hide list: Duck Termux entry" "$(cat "$_hma_list_default")" "com.termux"
assert_contains "hide list: Specter KernelSU entry" "$(cat "$_hma_list_default")" "me.weishu.kernelsu"
assert_eq "hide list: package count" "126" "$(grep -vcE '^[[:space:]]*(#|$)' "$_hma_list_default")"
assert_eq "hide list: no duplicates" "0" "$(grep -vE '^[[:space:]]*(#|$)' "$_hma_list_default" | sort | uniq -d | wc -l | tr -d ' ')"

_HMA_PY=""
command -v python3 >/dev/null 2>&1 && _HMA_PY="python3"

_hma_pyval() { # $1 file, $2 python expression on d
  [ -n "$_HMA_PY" ] || { printf '%s' "PYUNAVAILABLE"; return 0; }
  "$_HMA_PY" -c 'import json,sys; d=json.load(open(sys.argv[1], encoding="utf-8")); print(eval(sys.argv[2]))' "$1" "$2" 2>/dev/null
}

# ---------- merge: existing config with user data ----------
bootstrap
export HMAOSS_BASE="$TEST_ROOT/misc"
source_libs
mkdir -p "$HMAOSS_BASE"

# ---------- template targets: only blacklist app lists ----------
printf '%s' '{"templates":{"Black":{"isWhitelist":false,"appList":["hidden.one","hidden.two"]},"White":{"isWhitelist":true,"appList":["visible.one"]}}}' > "$TEST_ROOT/tpl.json"
_hma_template_targets "$TEST_ROOT/tpl.json" "$TEST_ROOT/tpl.txt"
assert_eq "template targets: blacklist only" "hidden.one hidden.two" "$(tr '\n' ' ' < "$TEST_ROOT/tpl.txt" | sed 's/ $//')"

# Reordered fields, pretty whitespace, and a skipped generated template.
cat > "$TEST_ROOT/tpl2.json" << 'EOF'
{"templates": {
  "Hide List": {"appList": ["stale.one"], "isWhitelist": false},
  "Other": {"appList": ["hidden.two", "hidden.three"], "isWhitelist": false},
  "White": {"appList": ["visible.one"], "isWhitelist": true}
}}
EOF
_hma_template_targets "$TEST_ROOT/tpl2.json" "$TEST_ROOT/tpl2.txt" "Hide List"
assert_eq "template targets: reordered and skipped" "hidden.two hidden.three" "$(tr '\n' ' ' < "$TEST_ROOT/tpl2.txt" | sed 's/ $//')"

# Hide-list parsing: leading/trailing whitespace and trailing comments.
printf '  me.weishu.kernelsu  \ncom.topjohnwu.magisk\t# root\ncom.not.installed\n# comment\n' > "$TEST_ROOT/hide-list.txt"
printf 'me.weishu.kernelsu\ncom.topjohnwu.magisk\n' > "$TEST_ROOT/installed.txt"
_hma_filter_hide_list "$TEST_ROOT/hide-list.txt" "$TEST_ROOT/installed.txt" "$TEST_ROOT/hide-out.txt"
assert_eq "hide list: whitespace and comments" "me.weishu.kernelsu com.topjohnwu.magisk" "$(tr '\n' ' ' < "$TEST_ROOT/hide-out.txt" | sed 's/ $//')"

_hm_applist="$TEST_ROOT/applist.txt"
cat > "$_hm_applist" << 'EOF'
me.weishu.kernelsu
com.topjohnwu.magisk
EOF

_hm_default="$TEST_ROOT/default.json"
printf '%s\n' '{"std":"default"}' > "$_hm_default"

_hm_scope="$TEST_ROOT/scope.tsv"
printf 'com.keep.app\t{"old":"keep"}\ncom.new.app\t{"std":"scope"}\n' > "$_hm_scope"

_hm_base="$TEST_ROOT/base1.json"
cat > "$_hm_base" << 'EOF'
{"configVersion":93,"detailLog":true,"templates":{"USER TPL":{"isWhitelist":true,"appList":["a"]},"Hide List":{"isWhitelist":true,"appList":["old"]}},"scope":{"com.keep.app":{"useWhitelist":true,"extraAppList":["x"]}},"defaultConfig":null,"xFuture":{"deep":[1,2,{"k":"v"}]}}
EOF
_hma_merge_config "$_hm_base" "$_hm_applist" "$_hm_scope" "$_hm_default" "$TEST_ROOT/merged1.json"
assert_exit_code "merge: existing config succeeds" 0 "$?"
_hm_out=$(cat "$TEST_ROOT/merged1.json")
assert_not_contains "merge: configVersion removed" "$_hm_out" '"configVersion"'
assert_contains "merge: user global preserved" "$_hm_out" '"detailLog":true'
assert_contains "merge: user template preserved" "$_hm_out" '"USER TPL"'
assert_contains "merge: unknown member preserved" "$_hm_out" '"xFuture":{"deep":[1,2,{"k":"v"}]}'
assert_not_contains "merge: old template list replaced" "$_hm_out" '["old"]'
assert_contains "merge: template rewritten" "$_hm_out" '"Hide List":{"isWhitelist":false,"appList":["me.weishu.kernelsu","com.topjohnwu.magisk"]}'
assert_contains "merge: existing scope entry untouched" "$_hm_out" '"com.keep.app":{"useWhitelist":true,"extraAppList":["x"]}'
assert_contains "merge: new scope entry added" "$_hm_out" '"com.new.app":{"std":"scope"}'
assert_contains "merge: defaultConfig replaced" "$_hm_out" '"defaultConfig":{"std":"default"}'
assert_not_contains "merge: null defaultConfig gone" "$_hm_out" '"defaultConfig":null'
_hm_dup=$(grep -o '"com.keep.app"' "$TEST_ROOT/merged1.json" | wc -l | tr -d ' ')
assert_eq "merge: kept app not duplicated" "1" "$_hm_dup"
assert_eq "merge: parses as JSON" "defaultConfig,detailLog,scope,templates,xFuture" "$(_hma_pyval "$TEST_ROOT/merged1.json" "','.join(sorted(d.keys()))")"
assert_eq "merge: scope keys exact" "com.keep.app,com.new.app" "$(_hma_pyval "$TEST_ROOT/merged1.json" "','.join(sorted(d['scope'].keys()))")"

# ---------- merge: legacy template name is migrated ----------
printf '%s' '{"templates":{"HIDE MY CUSTOM APP":{"isWhitelist":false,"appList":["old"]}},"scope":{"com.legacy":{"applyTemplates":["HIDE MY CUSTOM APP"]}},"defaultConfig":{"applyTemplates":["HIDE MY CUSTOM APP"]}}' > "$TEST_ROOT/base11.json"
_hma_merge_config "$TEST_ROOT/base11.json" "$_hm_applist" "$_hm_scope" "$_hm_default" "$TEST_ROOT/merged11.json"
assert_exit_code "merge: legacy template migration succeeds" 0 "$?"
_hm_legacy=$(cat "$TEST_ROOT/merged11.json")
assert_contains "merge: legacy template renamed" "$_hm_legacy" '"Hide List":'
assert_not_contains "merge: legacy template name removed" "$_hm_legacy" 'HIDE MY CUSTOM APP'
assert_contains "merge: legacy scope reference migrated" "$_hm_legacy" '"applyTemplates":["Hide List"]'
assert_contains "merge: legacy default reference migrated" "$_hm_legacy" '"defaultConfig":{"applyTemplates":["Hide List"]}'

# ---------- merge: excluded apps detached from generated template ----------
printf '%s' '{"templates":{"Hide List":{"isWhitelist":false,"appList":["hidden.app"]}},"scope":{"keep.app":{"applyTemplates":["Hide List"],"x":1},"hidden.app":{"applyTemplates":["Hide List"],"y":2}}}' > "$TEST_ROOT/base12.json"
printf 'hidden.app\n' > "$TEST_ROOT/applist12.txt"
printf 'keep.app\t{"applyTemplates":["Hide List"],"x":1}\n' > "$TEST_ROOT/scope12.tsv"
_hma_merge_config "$TEST_ROOT/base12.json" "$TEST_ROOT/applist12.txt" "$TEST_ROOT/scope12.tsv" "$_hm_default" "$TEST_ROOT/merged12.json"
assert_exit_code "merge: applied-to cleanup succeeds" 0 "$?"
assert_eq "merge: excluded app detached from template" "[]" "$(_hma_pyval "$TEST_ROOT/merged12.json" "str(d['scope']['hidden.app']['applyTemplates'])")"
assert_eq "merge: wanted app keeps template" "['Hide List']" "$(_hma_pyval "$TEST_ROOT/merged12.json" "str(d['scope']['keep.app']['applyTemplates'])")"

# ---------- merge: prune stale template even with no desired targets ----------
printf '%s' '{"templates":{"Hide List":{"isWhitelist":false,"appList":["hidden.app"]}},"scope":{"hidden.app":{"applyTemplates":["Hide List"],"y":2},"keep.app":{"applyTemplates":["Hide List"],"x":1}}}' > "$TEST_ROOT/base13.json"
: > "$TEST_ROOT/scope-empty.tsv"
_hma_merge_config "$TEST_ROOT/base13.json" "$TEST_ROOT/applist12.txt" "$TEST_ROOT/scope-empty.tsv" "$_hm_default" "$TEST_ROOT/merged13.json" "0" "" "1"
assert_exit_code "merge: empty-target prune succeeds" 0 "$?"
assert_eq "merge: empty-target prune detaches hidden" "[]" "$(_hma_pyval "$TEST_ROOT/merged13.json" "str(d['scope']['hidden.app']['applyTemplates'])")"
assert_eq "merge: empty-target prune detaches keep" "[]" "$(_hma_pyval "$TEST_ROOT/merged13.json" "str(d['scope']['keep.app']['applyTemplates'])")"

_hma_merge_config "$TEST_ROOT/base13.json" "$TEST_ROOT/applist12.txt" "$TEST_ROOT/scope-empty.tsv" "$_hm_default" "$TEST_ROOT/merged14.json" "0" "" "0"
assert_eq "merge: disabled prune keeps template" "['Hide List']" "$(_hma_pyval "$TEST_ROOT/merged14.json" "str(d['scope']['keep.app']['applyTemplates'])")"

# ---------- merge: fresh empty base ----------
printf '{}' > "$TEST_ROOT/base2.json"
_hma_merge_config "$TEST_ROOT/base2.json" "$_hm_applist" "$_hm_scope" "$_hm_default" "$TEST_ROOT/merged2.json"
assert_exit_code "merge: empty base succeeds" 0 "$?"
assert_eq "merge: fresh keys" "defaultConfig,scope,templates" "$(_hma_pyval "$TEST_ROOT/merged2.json" "','.join(sorted(d.keys()))")"
assert_eq "merge: fresh scope keys" "com.keep.app,com.new.app" "$(_hma_pyval "$TEST_ROOT/merged2.json" "','.join(sorted(d['scope'].keys()))")"
assert_eq "merge: fresh template apps" "me.weishu.kernelsu,com.topjohnwu.magisk" "$(_hma_pyval "$TEST_ROOT/merged2.json" "','.join(d['templates']['Hide List']['appList'])")"

# ---------- merge: configVersion first / middle / last / only ----------
printf '{"configVersion":1,"a":2}' > "$TEST_ROOT/base3.json"
_hma_merge_config "$TEST_ROOT/base3.json" "$_hm_applist" "$_hm_scope" "$_hm_default" "$TEST_ROOT/merged3.json"
assert_eq "merge: version-first keys" "a,defaultConfig,scope,templates" "$(_hma_pyval "$TEST_ROOT/merged3.json" "','.join(sorted(d.keys()))")"

printf '{"a":2,"configVersion":1}' > "$TEST_ROOT/base4.json"
_hma_merge_config "$TEST_ROOT/base4.json" "$_hm_applist" "$_hm_scope" "$_hm_default" "$TEST_ROOT/merged4.json"
assert_eq "merge: version-last keys" "a,defaultConfig,scope,templates" "$(_hma_pyval "$TEST_ROOT/merged4.json" "','.join(sorted(d.keys()))")"

printf '{"configVersion":1}' > "$TEST_ROOT/base5.json"
_hma_merge_config "$TEST_ROOT/base5.json" "$_hm_applist" "$_hm_scope" "$_hm_default" "$TEST_ROOT/merged5.json"
assert_eq "merge: version-only keys" "defaultConfig,scope,templates" "$(_hma_pyval "$TEST_ROOT/merged5.json" "','.join(sorted(d.keys()))")"

# ---------- merge: user defaultConfig wins ----------
printf '{"defaultConfig":{"mine":true},"scope":{}}' > "$TEST_ROOT/base6.json"
_hma_merge_config "$TEST_ROOT/base6.json" "$_hm_applist" "$_hm_scope" "$_hm_default" "$TEST_ROOT/merged6.json"
assert_eq "merge: user defaultConfig kept" "{'mine': True}" "$(_hma_pyval "$TEST_ROOT/merged6.json" "str(d['defaultConfig'])")"

# ---------- merge: empty hide list keeps the existing template ----------
printf '{"templates":{"Hide List":{"isWhitelist":false,"appList":["keepme"]}}}' > "$TEST_ROOT/base9.json"
: > "$TEST_ROOT/apps-empty.txt"
_hma_merge_config "$TEST_ROOT/base9.json" "$TEST_ROOT/apps-empty.txt" "$_hm_scope" "$_hm_default" "$TEST_ROOT/merged9.json" "1"
assert_exit_code "merge: empty hide list succeeds" 0 "$?"
assert_eq "merge: empty hide list keeps template" "['keepme']" "$(_hma_pyval "$TEST_ROOT/merged9.json" "str(d['templates']['Hide List']['appList'])")"
assert_eq "merge: empty hide list still adds scope" "True" "$(_hma_pyval "$TEST_ROOT/merged9.json" "'com.new.app' in d['scope']")"

# ---------- merge: value straddling the 1 KB tokenizer chunk boundary ----------
_hm_pad=$(printf '%*s' 1200 '' | tr ' ' 'x')
printf '{"templates":{"Hide List":{"appList":[]}},"note":"%s","k":1}' "$_hm_pad" > "$TEST_ROOT/base10.json"
_hma_merge_config "$TEST_ROOT/base10.json" "$_hm_applist" "$_hm_scope" "$_hm_default" "$TEST_ROOT/merged10.json"
assert_exit_code "merge: 1 KB boundary succeeds" 0 "$?"
assert_eq "merge: long value preserved" "1200" "$(_hma_pyval "$TEST_ROOT/merged10.json" "len(d['note'])")"
assert_eq "merge: boundary output valid" "1" "$(_hma_pyval "$TEST_ROOT/merged10.json" "int(d['k'])")"

# ---------- merge: pretty-printed base, escapes, empty templates ----------
cat > "$TEST_ROOT/base7.json" << 'EOF'
{
  "templates": {
    "Hide List": {"isWhitelist": true, "appList": ["x"]},
    "T2": {"isWhitelist": false, "appList": ["y"]}
  },
  "note": "keep \"quotes\" and \\ backslash",
  "scope": {},
  "defaultConfig": null
}
EOF
_hma_merge_config "$TEST_ROOT/base7.json" "$_hm_applist" "$_hm_scope" "$_hm_default" "$TEST_ROOT/merged7.json"
assert_exit_code "merge: pretty base succeeds" 0 "$?"
assert_eq "merge: pretty escapes preserved" 'keep "quotes" and \ backslash' "$(_hma_pyval "$TEST_ROOT/merged7.json" "d['note']")"
assert_eq "merge: pretty scope keys" "com.keep.app,com.new.app" "$(_hma_pyval "$TEST_ROOT/merged7.json" "','.join(sorted(d['scope'].keys()))")"
assert_eq "merge: pretty user template kept" "['y']" "$(_hma_pyval "$TEST_ROOT/merged7.json" "d['templates']['T2']['appList']")"
assert_eq "merge: pretty default set" "{'std': 'default'}" "$(_hma_pyval "$TEST_ROOT/merged7.json" "str(d['defaultConfig'])")"

# ---------- merge: malformed base fails closed ----------
printf '{"a":' > "$TEST_ROOT/base8.json"
_hma_merge_config "$TEST_ROOT/base8.json" "$_hm_applist" "$_hm_scope" "$_hm_default" "$TEST_ROOT/merged8.json"
assert_exit_code "merge: malformed base fails" 3 "$?"
assert_file_not_exists "merge: malformed base writes nothing" "$TEST_ROOT/merged8.json"

# ---------- feature: end to end against a fake HMA dir ----------
bootstrap
export HMAOSS_BASE="$TEST_ROOT/misc"
export SPECTER_HMA_NO_UI_RELOAD=1
source_libs
mkdir -p "$HMAOSS_BASE/hide_my_applist_test"
_hm_cfg="$HMAOSS_BASE/hide_my_applist_test/config.json"
printf '{"configVersion":93,"detailLog":false,"templates":{"Hide example":{"isWhitelist":false,"appList":["com.excluded.app"]}},"scope":{"com.preexisting":{"useWhitelist":true,"extraAppList":["z"]}}}' > "$_hm_cfg"

cat > "$BIN_DIR/pm" << 'MOCK'
#!/bin/sh
case "$*" in
  *"-3"*) printf 'package:com.preexisting\npackage:com.newapp\npackage:com.excluded.app\npackage:me.weishu.kernelsu\npackage:org.frknkrc44.hma_oss\n' ;;
  *list*packages*) printf 'package:com.preexisting\npackage:com.newapp\npackage:com.excluded.app\npackage:me.weishu.kernelsu\npackage:org.frknkrc44.hma_oss\n' ;;
  *) echo "mock pm $*" ;;
esac
MOCK
chmod +x "$BIN_DIR/pm"
printf '#!/bin/sh\nexit 0\n' > "$BIN_DIR/chown"; chmod +x "$BIN_DIR/chown"
printf '#!/bin/sh\nexit 0\n' > "$BIN_DIR/restorecon"; chmod +x "$BIN_DIR/restorecon"

mkdir -p "$SPECTER_DIR/config"
printf '# test\nme.weishu.kernelsu\ncom.topjohnwu.magisk\ncom.not.installed\n' > "$SPECTER_DIR/config/hma-hide-list.txt"

_hm_feat_out=$(run_feature hma.sh)
assert_contains "feature: installed-only count" "$_hm_feat_out" "Hidden apps: 1"
assert_contains "feature: apply hint" "$_hm_feat_out" "reboot or long-press HMA-OSS Home"
assert_file_exists "feature: backup written" "${_hm_cfg}.specter.bak"
assert_eq "feature: preexisting kept" "{'useWhitelist': True, 'extraAppList': ['z']}" "$(_hma_pyval "$_hm_cfg" "str(d['scope']['com.preexisting'])")"
assert_eq "feature: new app targeted" "True" "$(_hma_pyval "$_hm_cfg" "'com.newapp' in d['scope']")"
assert_eq "feature: hma app not targeted" "False" "$(_hma_pyval "$_hm_cfg" "'org.frknkrc44.hma_oss' in d['scope']")"
assert_eq "feature: hidden app not targeted" "False" "$(_hma_pyval "$_hm_cfg" "'me.weishu.kernelsu' in d['scope']")"
assert_eq "feature: custom template target not targeted" "False" "$(_hma_pyval "$_hm_cfg" "'com.excluded.app' in d['scope']")"
assert_eq "feature: hidden template filtered" "['me.weishu.kernelsu']" "$(_hma_pyval "$_hm_cfg" "d['templates']['Hide List']['appList']")"
assert_eq "feature: configVersion absent" "False" "$(_hma_pyval "$_hm_cfg" "'configVersion' in d")"
assert_eq "feature: defaultConfig set" "False" "$(_hma_pyval "$_hm_cfg" "d['defaultConfig'] is None")"

# ---------- feature: blacklist keeps an app out of scope ----------
bootstrap
export HMAOSS_BASE="$TEST_ROOT/misc"
source_libs
mkdir -p "$HMAOSS_BASE/hide_my_applist_test"
_hm_cfg2="$HMAOSS_BASE/hide_my_applist_test/config.json"
printf '{}' > "$_hm_cfg2"
cat > "$BIN_DIR/pm" << 'MOCK'
#!/bin/sh
case "$*" in
  *"-3"*) printf 'package:com.blocked\npackage:com.allowed\npackage:org.frknkrc44.hma_oss\n' ;;
  *list*packages*) printf 'package:com.blocked\npackage:com.allowed\npackage:org.frknkrc44.hma_oss\n' ;;
  *) echo "mock pm $*" ;;
esac
MOCK
chmod +x "$BIN_DIR/pm"
printf '#!/bin/sh\nexit 0\n' > "$BIN_DIR/chown"; chmod +x "$BIN_DIR/chown"
printf '#!/bin/sh\nexit 0\n' > "$BIN_DIR/restorecon"; chmod +x "$BIN_DIR/restorecon"
mkdir -p "$SPECTER_DIR/config"
printf 'me.weishu.kernelsu\n' > "$SPECTER_DIR/config/hma-hide-list.txt"
printf 'com.blocked # comment\n' > "$SPECTER_DIR/blacklist.txt"
: > "$SPECTER_DIR/blacklist_enabled"

run_feature hma.sh >/dev/null 2>&1
assert_eq "feature: blacklisted app skipped" "False" "$(_hma_pyval "$_hm_cfg2" "'com.blocked' in d['scope']")"
assert_eq "feature: allowed app added" "True" "$(_hma_pyval "$_hm_cfg2" "'com.allowed' in d['scope']")"

# ---------- feature: a failed Xposed scan is reported, not silent ----------
bootstrap
export HMAOSS_BASE="$TEST_ROOT/misc"
export SPECTER_HMA_NO_UI_RELOAD=1
export SPECTER_DEX="$TEST_ROOT/fake.dex"
source_libs
mkdir -p "$HMAOSS_BASE/hide_my_applist_test"
_hm_cfg4="$HMAOSS_BASE/hide_my_applist_test/config.json"
printf '{}' > "$_hm_cfg4"
cat > "$BIN_DIR/pm" << 'MOCK'
#!/bin/sh
case "$*" in
  *"-3"*) printf 'package:com.live.app\npackage:org.frknkrc44.hma_oss\n' ;;
  *list*packages*) printf 'package:com.live.app\npackage:org.frknkrc44.hma_oss\n' ;;
  *) echo "mock pm $*" ;;
esac
MOCK
chmod +x "$BIN_DIR/pm"
printf '#!/bin/sh\nexit 0\n' > "$BIN_DIR/chown"; chmod +x "$BIN_DIR/chown"
printf '#!/bin/sh\nexit 0\n' > "$BIN_DIR/restorecon"; chmod +x "$BIN_DIR/restorecon"
printf '#!/bin/sh\nexit 1\n' > "$BIN_DIR/app_process"; chmod +x "$BIN_DIR/app_process"
printf 'fake dex\n' > "$SPECTER_DEX"
mkdir -p "$SPECTER_DIR/config"
printf 'me.weishu.kernelsu\n' > "$SPECTER_DIR/config/hma-hide-list.txt"
_hm_scanfail_out=$(run_feature hma.sh)
assert_contains "feature: scan failure warned" "$_hm_scanfail_out" "Xposed module scan failed"
unset SPECTER_DEX

# ---------- feature: a kept template still excludes its own hidden apps ----------
bootstrap
export HMAOSS_BASE="$TEST_ROOT/misc"
export SPECTER_HMA_NO_UI_RELOAD=1
source_libs
mkdir -p "$HMAOSS_BASE/hide_my_applist_test"
_hm_cfg5="$HMAOSS_BASE/hide_my_applist_test/config.json"
printf '%s' '{"templates":{"Hide List":{"isWhitelist":false,"appList":["com.hidden"]}},"scope":{"com.hidden":{"applyTemplates":["Hide List"]}}}' > "$_hm_cfg5"
cat > "$BIN_DIR/pm" << 'MOCK'
#!/bin/sh
case "$*" in
  *"-3"*) printf 'package:com.hidden\npackage:org.frknkrc44.hma_oss\n' ;;
  *list*packages*) printf 'package:com.hidden\npackage:org.frknkrc44.hma_oss\n' ;;
  *) echo "mock pm $*" ;;
esac
MOCK
chmod +x "$BIN_DIR/pm"
printf '#!/bin/sh\nexit 0\n' > "$BIN_DIR/chown"; chmod +x "$BIN_DIR/chown"
printf '#!/bin/sh\nexit 0\n' > "$BIN_DIR/restorecon"; chmod +x "$BIN_DIR/restorecon"
mkdir -p "$SPECTER_DIR/config"
printf 'com.not.installed\n' > "$SPECTER_DIR/config/hma-hide-list.txt"
_hm_kept_out=$(run_feature hma.sh)
assert_contains "feature: kept template warned" "$_hm_kept_out" "keeping existing template"
assert_eq "feature: kept template appList preserved" "['com.hidden']" "$(_hma_pyval "$_hm_cfg5" "d['templates']['Hide List']['appList']")"
assert_eq "feature: kept hidden app detached" "[]" "$(_hma_pyval "$_hm_cfg5" "str(d['scope']['com.hidden']['applyTemplates'])")"

# ---------- feature: live reload gesture (status card long-press) ----------
bootstrap
export HMAOSS_BASE="$TEST_ROOT/misc"
unset SPECTER_HMA_NO_UI_RELOAD
source_libs
mkdir -p "$HMAOSS_BASE/hide_my_applist_test"
_hm_cfg3="$HMAOSS_BASE/hide_my_applist_test/config.json"
printf '{}' > "$_hm_cfg3"
cat > "$BIN_DIR/pm" << 'MOCK'
#!/bin/sh
case "$*" in
  *"-3"*) printf 'package:com.live.app\npackage:org.frknkrc44.hma_oss\n' ;;
  *list*packages*) printf 'package:com.live.app\npackage:org.frknkrc44.hma_oss\n' ;;
  *) echo "mock pm $*" ;;
esac
MOCK
chmod +x "$BIN_DIR/pm"
printf '#!/bin/sh\nexit 0\n' > "$BIN_DIR/chown"; chmod +x "$BIN_DIR/chown"
printf '#!/bin/sh\nexit 0\n' > "$BIN_DIR/restorecon"; chmod +x "$BIN_DIR/restorecon"
cat > "$BIN_DIR/am" << 'MOCK'
#!/bin/sh
echo "AM $*" >> "$MOCK_DIR/logs/am.log"
MOCK
chmod +x "$BIN_DIR/am"
cat > "$BIN_DIR/dumpsys" << 'MOCK'
#!/bin/sh
case "$*" in
  *window*) echo "  mCurrentFocus=Window{abc u0 org.frknkrc44.hma_oss/org.frknkrc44.hma_oss.ui.activity.MainActivity}" ;;
  *) echo "  mResumedActivity: ActivityRecord{abc u0 com.test.prev/.Main t7}" ;;
esac
MOCK
chmod +x "$BIN_DIR/dumpsys"
cat > "$BIN_DIR/uiautomator" << 'MOCK'
#!/bin/sh
[ "$1" = "dump" ] && printf '%s\n' '<hierarchy><node class="android.widget.FrameLayout" bounds="[0,0][1080,2400]"><node resource-id="org.frknkrc44.hma_oss:id/status_card" bounds="[100,200][900,400]" /></node></hierarchy>' > "$2"
MOCK
chmod +x "$BIN_DIR/uiautomator"
cat > "$BIN_DIR/input" << 'MOCK'
#!/bin/sh
echo "INPUT $*" >> "$MOCK_DIR/logs/input.log"
MOCK
chmod +x "$BIN_DIR/input"
mkdir -p "$SPECTER_DIR/config"
printf 'me.weishu.kernelsu\n' > "$SPECTER_DIR/config/hma-hide-list.txt"

set_cfg hma_launch_mode always
_hm_feat_out3=$(run_feature hma.sh)
assert_contains "feature: live reload requested" "$_hm_feat_out3" "Live reload requested"
_hm_inp=$(cat "$LOGS_DIR/input.log" 2>/dev/null || echo "")
assert_contains "feature: status card long-press dispatched" "$_hm_inp" "swipe 500 300 500 300 900"

# ---------- feature: launch policy applies to the direct WebUI run ----------
set_cfg hma_launch_mode never
: > "$LOGS_DIR/input.log"
: > "$LOGS_DIR/am.log"
_hm_feat_never=$(run_feature hma.sh)
assert_contains "feature: auto-refuse skips the launch" "$_hm_feat_never" "launch skipped (auto-refuse)"
assert_eq "feature: auto-refuse leaves the app closed" "0" "$(wc -l < "$LOGS_DIR/am.log" | tr -d ' ')"
assert_eq "feature: auto-refuse skips the gesture" "0" "$(wc -l < "$LOGS_DIR/input.log" | tr -d ' ')"

set_cfg hma_launch_mode always
set_cfg toggle_hma_live_reload 0
: > "$LOGS_DIR/input.log"
: > "$LOGS_DIR/am.log"
_hm_feat_always=$(run_feature hma.sh)
assert_contains "feature: auto-accept opens HMA-OSS" "$_hm_feat_always" "HMA-OSS opened"
assert_contains "feature: auto-accept starts the activity" "$(cat "$LOGS_DIR/am.log")" "org.frknkrc44.hma_oss/org.frknkrc44.hma_oss.ui.activity.MainActivity"
assert_eq "feature: auto-accept skips the gesture" "0" "$(wc -l < "$LOGS_DIR/input.log" | tr -d ' ')"

set_cfg hma_launch_mode prompt
set_cfg toggle_hma_live_reload 1
: > "$LOGS_DIR/input.log"
: > "$LOGS_DIR/am.log"
_hm_feat_prompt=$(run_feature hma.sh)
assert_contains "feature: prompt without a terminal does not launch" "$_hm_feat_prompt" "no terminal to ask"
assert_eq "feature: prompt leaves the app closed" "0" "$(wc -l < "$LOGS_DIR/am.log" | tr -d ' ')"
assert_eq "feature: prompt skips the gesture" "0" "$(wc -l < "$LOGS_DIR/input.log" | tr -d ' ')"

# ---------- feature: hma not installed is a no-op ----------
bootstrap
export HMAOSS_BASE="$TEST_ROOT/misc"
source_libs
_hm_missing_out=$(run_feature hma.sh)
assert_contains "feature: not-installed notice" "$_hm_missing_out" "HMA-OSS not installed"

done_testing
