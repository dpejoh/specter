plan "HMA-OSS config generation and merge"

_HMA_PY=""
command -v python3 >/dev/null 2>&1 && _HMA_PY="python3"

_hma_pyval() { # $1 file, $2 python expression on d
  [ -n "$_HMA_PY" ] || { printf '%s' "PYUNAVAILABLE"; return 0; }
  "$_HMA_PY" -c 'import json,sys; d=json.load(open(sys.argv[1], encoding="utf-8")); print(eval(sys.argv[2]))' "$1" "$2" 2>/dev/null
}

# ---------- appconfig: 7 presets and empty applyTemplates ----------
bootstrap
source_libs
_hma_cfg_default=$(_hma_appconfig_json)
printf '%s' "$_hma_cfg_default" > "$TEST_ROOT/appconfig.json"
assert_eq "appconfig: applyTemplates empty" "[]" "$(_hma_pyval "$TEST_ROOT/appconfig.json" "str(d['applyTemplates'])")"
assert_eq "appconfig: all 7 presets" "['accessibility_apps', 'custom_rom', 'detector_apps', 'root_apps', 'shizuku_dhizuku', 'sus_apps', 'xposed']" "$(_hma_pyval "$TEST_ROOT/appconfig.json" "sorted(d['applyPresets'])")"
assert_eq "appconfig: 3 settings presets" "['accessibility', 'dev_options', 'input_method']" "$(_hma_pyval "$TEST_ROOT/appconfig.json" "sorted(d['applySettingsPresets'])")"
_hma_cfg_det_default=$(_hma_appconfig_json no-detectors)
printf '%s' "$_hma_cfg_det_default" > "$TEST_ROOT/appconfig-nodet.json"
assert_eq "appconfig: detector targets omit detector preset" "['accessibility_apps', 'custom_rom', 'root_apps', 'shizuku_dhizuku', 'sus_apps', 'xposed']" "$(_hma_pyval "$TEST_ROOT/appconfig-nodet.json" "sorted(d['applyPresets'])")"

# ---------- preset cache: parse v2 cache (only the cache object) ----------
printf '%s' '{"cache":{"root_apps":["com.topjohnwu.magisk","me.weishu.kernelsu"],"detector_apps":["io.github.vvb2060.mahoshojo"],"xposed":["org.lsposed.manager"],"sus_apps":["bin.mt.plus"],"shizuku_dhizuku":["moe.shizuku.privileged.api"],"custom_rom":["org.lineageos.updater"],"accessibility_apps":["com.example.acc"]},"riskyPackageCache":["com.bank.app"],"allAppsList":["com.android.chrome","com.topjohnwu.magisk"]}' > "$TEST_ROOT/preset_cache_v2.json"
_hma_preset_cache_apps "$TEST_ROOT/preset_cache_v2.json" "$TEST_ROOT/preset_out.txt" "$TEST_ROOT/detector_out.txt"
assert_contains "preset cache: root app extracted" "$(cat "$TEST_ROOT/preset_out.txt")" "com.topjohnwu.magisk"
assert_not_contains "preset cache: detector app not excluded" "$(cat "$TEST_ROOT/preset_out.txt")" "io.github.vvb2060.mahoshojo"
assert_contains "preset cache: detector list extracted" "$(cat "$TEST_ROOT/detector_out.txt")" "io.github.vvb2060.mahoshojo"
assert_contains "preset cache: xposed extracted" "$(cat "$TEST_ROOT/preset_out.txt")" "org.lsposed.manager"
assert_contains "preset cache: accessibility extracted" "$(cat "$TEST_ROOT/preset_out.txt")" "com.example.acc"
assert_not_contains "preset cache: riskyPackageCache ignored" "$(cat "$TEST_ROOT/preset_out.txt")" "com.bank.app"
assert_not_contains "preset cache: allAppsList ignored" "$(cat "$TEST_ROOT/preset_out.txt")" "com.android.chrome"
assert_eq "preset cache: total packages" "7" "$(wc -l < "$TEST_ROOT/preset_out.txt" | tr -d ' ')"
assert_eq "preset cache: total detectors" "1" "$(wc -l < "$TEST_ROOT/detector_out.txt" | tr -d ' ')"

# Empty cache and an obsolete top-level key are both treated as no exclusions.
printf '%s' '{"cache":{}}' > "$TEST_ROOT/preset_empty.json"
_hma_preset_cache_apps "$TEST_ROOT/preset_empty.json" "$TEST_ROOT/preset_empty.txt" "$TEST_ROOT/detector_empty.txt"
assert_eq "preset cache: empty cache produces no exclusions" "0" "$(wc -l < "$TEST_ROOT/preset_empty.txt" | tr -d ' ')"
assert_eq "preset cache: empty cache produces no detectors" "0" "$(wc -l < "$TEST_ROOT/detector_empty.txt" | tr -d ' ')"
printf '%s' '{"presetPackageNames":{"root_apps":["legacy.pkg"]}}' > "$TEST_ROOT/preset_legacy.json"
_hma_preset_cache_apps "$TEST_ROOT/preset_legacy.json" "$TEST_ROOT/preset_legacy.txt" "$TEST_ROOT/detector_legacy.txt"
assert_eq "preset cache: legacy key ignored" "0" "$(wc -l < "$TEST_ROOT/preset_legacy.txt" | tr -d ' ')"

# ---------- merge: existing config with user data ----------
bootstrap
source_libs
printf 'com.keep.app\t{"useWhitelist":true,"extraAppList":["x"]}\ncom.legacy\t{"applyTemplates":["HIDE MY CUSTOM APP"],"applyPresets":["root_apps"]}\ncom.none\t{"foo":1}\ncom.new.app\t{"applyTemplates":[],"applyPresets":["accessibility_apps","custom_rom","detector_apps","root_apps","shizuku_dhizuku","sus_apps","xposed"]}\n' > "$TEST_ROOT/scope.tsv"
printf 'com.excluded\n' > "$TEST_ROOT/exclude.txt"
_hma_appconfig_json > "$TEST_ROOT/default.json"
cat > "$TEST_ROOT/base1.json" << 'EOF'
{"configVersion":93,"detailLog":true,"templates":{"USER TPL":{"isWhitelist":true,"appList":["a"]},"Hide List":{"isWhitelist":false,"appList":["old"]}},"scope":{"com.keep.app":{"useWhitelist":true,"extraAppList":["x"]},"com.legacy":{"applyTemplates":["HIDE MY CUSTOM APP"],"applyPresets":["root_apps"]},"com.none":{"foo":1},"com.excluded":{"y":2}},"defaultConfig":null,"xFuture":{"deep":[1,2,{"k":"v"}]}}
EOF
_hma_merge_config "$TEST_ROOT/base1.json" "$TEST_ROOT/scope.tsv" "$TEST_ROOT/default.json" "$TEST_ROOT/merged1.json" "" "$TEST_ROOT/exclude.txt"
assert_exit_code "merge: existing config succeeds" 0 "$?"
_hm_out=$(cat "$TEST_ROOT/merged1.json")
assert_not_contains "merge: configVersion removed" "$_hm_out" '"configVersion"'
assert_contains "merge: user global preserved" "$_hm_out" '"detailLog":true'
assert_contains "merge: user template preserved" "$_hm_out" '"USER TPL"'
assert_contains "merge: generated template left untouched" "$_hm_out" '"Hide List":{"isWhitelist":false,"appList":["old"]}'
assert_contains "merge: unknown member preserved" "$_hm_out" '"xFuture":{"deep":[1,2,{"k":"v"}]}'
assert_contains "merge: new scope entry added" "$_hm_out" '"com.new.app"'
assert_not_contains "merge: excluded app dropped" "$_hm_out" '"com.excluded"'
assert_eq "merge: excluded app removed from scope" "False" "$(_hma_pyval "$TEST_ROOT/merged1.json" "'com.excluded' in d['scope']")"
assert_eq "merge: whitelist entry untouched" "{'useWhitelist': True, 'extraAppList': ['x']}" "$(_hma_pyval "$TEST_ROOT/merged1.json" "str(d['scope']['com.keep.app'])")"
assert_eq "merge: legacy template reference preserved" "['HIDE MY CUSTOM APP']" "$(_hma_pyval "$TEST_ROOT/merged1.json" "str(d['scope']['com.legacy']['applyTemplates'])")"
assert_eq "merge: existing presets upgraded" "['accessibility_apps', 'custom_rom', 'detector_apps', 'root_apps', 'shizuku_dhizuku', 'sus_apps', 'xposed']" "$(_hma_pyval "$TEST_ROOT/merged1.json" "sorted(d['scope']['com.legacy']['applyPresets'])")"
assert_eq "merge: missing presets added" "['accessibility_apps', 'custom_rom', 'detector_apps', 'root_apps', 'shizuku_dhizuku', 'sus_apps', 'xposed']" "$(_hma_pyval "$TEST_ROOT/merged1.json" "sorted(d['scope']['com.none']['applyPresets'])")"
assert_eq "merge: new entry has all presets" "['accessibility_apps', 'custom_rom', 'detector_apps', 'root_apps', 'shizuku_dhizuku', 'sus_apps', 'xposed']" "$(_hma_pyval "$TEST_ROOT/merged1.json" "sorted(d['scope']['com.new.app']['applyPresets'])")"
assert_eq "merge: new entry has no templates" "[]" "$(_hma_pyval "$TEST_ROOT/merged1.json" "str(d['scope']['com.new.app']['applyTemplates'])")"
assert_eq "merge: defaultConfig replaced" "[]" "$(_hma_pyval "$TEST_ROOT/merged1.json" "str(d['defaultConfig']['applyTemplates'])")"
assert_eq "merge: defaultConfig has 7 presets" "['accessibility_apps', 'custom_rom', 'detector_apps', 'root_apps', 'shizuku_dhizuku', 'sus_apps', 'xposed']" "$(_hma_pyval "$TEST_ROOT/merged1.json" "sorted(d['defaultConfig']['applyPresets'])")"
assert_eq "merge: parses as JSON" "defaultConfig,detailLog,scope,templates,xFuture" "$(_hma_pyval "$TEST_ROOT/merged1.json" "','.join(sorted(d.keys()))")"
assert_eq "merge: scope keys exact" "com.keep.app,com.legacy,com.new.app,com.none" "$(_hma_pyval "$TEST_ROOT/merged1.json" "','.join(sorted(d['scope'].keys()))")"

# ---------- merge: fresh empty base ----------
printf '{}' > "$TEST_ROOT/base2.json"
_hma_merge_config "$TEST_ROOT/base2.json" "$TEST_ROOT/scope.tsv" "$TEST_ROOT/default.json" "$TEST_ROOT/merged2.json" "" ""
assert_exit_code "merge: empty base succeeds" 0 "$?"
assert_eq "merge: fresh keys" "defaultConfig,scope" "$(_hma_pyval "$TEST_ROOT/merged2.json" "','.join(sorted(d.keys()))")"
assert_eq "merge: fresh scope keys" "com.keep.app,com.legacy,com.new.app,com.none" "$(_hma_pyval "$TEST_ROOT/merged2.json" "','.join(sorted(d['scope'].keys()))")"
assert_eq "merge: fresh entries have presets" "True" "$(_hma_pyval "$TEST_ROOT/merged2.json" "'applyPresets' in d['scope']['com.new.app']")"

# ---------- merge: configVersion first / middle / last / only ----------
printf '{"configVersion":1,"a":2}' > "$TEST_ROOT/base3.json"
_hma_merge_config "$TEST_ROOT/base3.json" "$TEST_ROOT/scope.tsv" "$TEST_ROOT/default.json" "$TEST_ROOT/merged3.json" "" ""
assert_eq "merge: version-first keys" "a,defaultConfig,scope" "$(_hma_pyval "$TEST_ROOT/merged3.json" "','.join(sorted(d.keys()))")"

printf '{"a":2,"configVersion":1}' > "$TEST_ROOT/base4.json"
_hma_merge_config "$TEST_ROOT/base4.json" "$TEST_ROOT/scope.tsv" "$TEST_ROOT/default.json" "$TEST_ROOT/merged4.json" "" ""
assert_eq "merge: version-last keys" "a,defaultConfig,scope" "$(_hma_pyval "$TEST_ROOT/merged4.json" "','.join(sorted(d.keys()))")"

printf '{"configVersion":1}' > "$TEST_ROOT/base5.json"
_hma_merge_config "$TEST_ROOT/base5.json" "$TEST_ROOT/scope.tsv" "$TEST_ROOT/default.json" "$TEST_ROOT/merged5.json" "" ""
assert_eq "merge: version-only keys" "defaultConfig,scope" "$(_hma_pyval "$TEST_ROOT/merged5.json" "','.join(sorted(d.keys()))")"

# ---------- merge: user defaultConfig wins ----------
printf '{"defaultConfig":{"mine":true},"scope":{}}' > "$TEST_ROOT/base6.json"
_hma_merge_config "$TEST_ROOT/base6.json" "$TEST_ROOT/scope.tsv" "$TEST_ROOT/default.json" "$TEST_ROOT/merged6.json" "" ""
assert_eq "merge: user defaultConfig kept" "{'mine': True}" "$(_hma_pyval "$TEST_ROOT/merged6.json" "str(d['defaultConfig'])")"

# ---------- merge: excluded app pruned, kept entries normalized ----------
printf '{"scope":{"hidden.app":{"applyPresets":["root_apps"]},"kept.app":{"applyPresets":["root_apps","xposed"]},"white.app":{"useWhitelist":true}}}' > "$TEST_ROOT/base7.json"
printf 'hidden.app\n' > "$TEST_ROOT/exclude7.txt"
printf 'kept.app\t{"applyPresets":["root_apps","xposed"]}\nnew.app\t{"applyPresets":["accessibility_apps","custom_rom","detector_apps","root_apps","shizuku_dhizuku","sus_apps","xposed"]}\n' > "$TEST_ROOT/scope7.tsv"
_hma_merge_config "$TEST_ROOT/base7.json" "$TEST_ROOT/scope7.tsv" "$TEST_ROOT/default.json" "$TEST_ROOT/merged7.json" "" "$TEST_ROOT/exclude7.txt"
assert_eq "merge: excluded entry pruned" "False" "$(_hma_pyval "$TEST_ROOT/merged7.json" "'hidden.app' in d['scope']")"
assert_eq "merge: kept entry upgraded to 7 presets" "['accessibility_apps', 'custom_rom', 'detector_apps', 'root_apps', 'shizuku_dhizuku', 'sus_apps', 'xposed']" "$(_hma_pyval "$TEST_ROOT/merged7.json" "sorted(d['scope']['kept.app']['applyPresets'])")"
assert_eq "merge: whitelist entry not normalized" "{'useWhitelist': True}" "$(_hma_pyval "$TEST_ROOT/merged7.json" "str(d['scope']['white.app'])")"
assert_eq "merge: new entry added" "True" "$(_hma_pyval "$TEST_ROOT/merged7.json" "'new.app' in d['scope']")"

# ---------- merge: detector targets omit the detector_apps preset ----------
printf '{"scope":{"detector.app":{"applyPresets":["root_apps"]},"normal.app":{}}}' > "$TEST_ROOT/base7b.json"
printf 'detector.app\nnewdet.app\n' > "$TEST_ROOT/detectors7b.txt"
printf 'newdet.app\t{"applyTemplates":[],"applyPresets":["accessibility_apps","custom_rom","detector_apps","root_apps","shizuku_dhizuku","sus_apps","xposed"]}\n' > "$TEST_ROOT/scope7b.tsv"
_hma_merge_config "$TEST_ROOT/base7b.json" "$TEST_ROOT/scope7b.tsv" "$TEST_ROOT/default.json" "$TEST_ROOT/merged7b.json" "" "" "$TEST_ROOT/detectors7b.txt"
assert_eq "merge: existing detector gets 6 presets" "['accessibility_apps', 'custom_rom', 'root_apps', 'shizuku_dhizuku', 'sus_apps', 'xposed']" "$(_hma_pyval "$TEST_ROOT/merged7b.json" "sorted(d['scope']['detector.app']['applyPresets'])")"
assert_eq "merge: new detector gets 6 presets" "['accessibility_apps', 'custom_rom', 'root_apps', 'shizuku_dhizuku', 'sus_apps', 'xposed']" "$(_hma_pyval "$TEST_ROOT/merged7b.json" "sorted(d['scope']['newdet.app']['applyPresets'])")"
assert_eq "merge: normal app keeps 7 presets" "['accessibility_apps', 'custom_rom', 'detector_apps', 'root_apps', 'shizuku_dhizuku', 'sus_apps', 'xposed']" "$(_hma_pyval "$TEST_ROOT/merged7b.json" "sorted(d['scope']['normal.app']['applyPresets'])")"

# ---------- merge: pretty base, escapes, empty scope ----------
cat > "$TEST_ROOT/base8.json" << 'EOF'
{
  "templates": {
    "T2": {"isWhitelist": false, "appList": ["y"]}
  },
  "note": "keep \"quotes\" and \\ backslash",
  "scope": {},
  "defaultConfig": null
}
EOF
_hma_merge_config "$TEST_ROOT/base8.json" "$TEST_ROOT/scope.tsv" "$TEST_ROOT/default.json" "$TEST_ROOT/merged8.json" "" ""
assert_exit_code "merge: pretty base succeeds" 0 "$?"
assert_eq "merge: pretty escapes preserved" 'keep "quotes" and \ backslash' "$(_hma_pyval "$TEST_ROOT/merged8.json" "d['note']")"
assert_eq "merge: pretty user template kept" "['y']" "$(_hma_pyval "$TEST_ROOT/merged8.json" "d['templates']['T2']['appList']")"
assert_eq "merge: pretty default set" "[]" "$(_hma_pyval "$TEST_ROOT/merged8.json" "str(d['defaultConfig']['applyTemplates'])")"

# ---------- merge: value straddling the 1 KB tokenizer chunk boundary ----------
_hm_pad=$(printf '%*s' 1200 '' | tr ' ' 'x')
printf '{"templates":{"T":{"appList":[]}},"note":"%s","k":1}' "$_hm_pad" > "$TEST_ROOT/base9.json"
_hma_merge_config "$TEST_ROOT/base9.json" "$TEST_ROOT/scope.tsv" "$TEST_ROOT/default.json" "$TEST_ROOT/merged9.json" "" ""
assert_exit_code "merge: 1 KB boundary succeeds" 0 "$?"
assert_eq "merge: long value preserved" "1200" "$(_hma_pyval "$TEST_ROOT/merged9.json" "len(d['note'])")"
assert_eq "merge: boundary output valid" "1" "$(_hma_pyval "$TEST_ROOT/merged9.json" "int(d['k'])")"

# ---------- merge: malformed base fails closed ----------
printf '{"a":' > "$TEST_ROOT/base10.json"
_hma_merge_config "$TEST_ROOT/base10.json" "$TEST_ROOT/scope.tsv" "$TEST_ROOT/default.json" "$TEST_ROOT/merged10.json" "" ""
assert_exit_code "merge: malformed base fails" 3 "$?"
assert_file_not_exists "merge: malformed base writes nothing" "$TEST_ROOT/merged10.json"

# ---------- feature: missing preset cache still generates a profile ----------
bootstrap
export HMAOSS_BASE="$TEST_ROOT/misc"
source_libs
mkdir -p "$HMAOSS_BASE/hide_my_applist_test"
_hm_cfg="$HMAOSS_BASE/hide_my_applist_test/config.json"
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
_hm_missing_cache_out=$(run_feature hma.sh)
assert_contains "feature: missing cache is not fatal" "$_hm_missing_cache_out" "preset cache missing"
assert_contains "feature: missing cache continued" "$_hm_missing_cache_out" "continuing without preset exclusions"
assert_file_exists "feature: missing cache wrote config" "$_hm_cfg"
assert_eq "feature: missing cache still targets app" "True" "$(_hma_pyval "$_hm_cfg" "'com.live.app' in d['scope']")"
assert_eq "feature: missing cache uses 7 presets" "['accessibility_apps', 'custom_rom', 'detector_apps', 'root_apps', 'shizuku_dhizuku', 'sus_apps', 'xposed']" "$(_hma_pyval "$_hm_cfg" "sorted(d['scope']['com.live.app']['applyPresets'])")"

# ---------- feature: detector-only cache still generates a profile ----------
bootstrap
export HMAOSS_BASE="$TEST_ROOT/misc"
source_libs
mkdir -p "$HMAOSS_BASE/hide_my_applist_test"
_hm_cfg_det="$HMAOSS_BASE/hide_my_applist_test/config.json"
printf '%s' '{"cache":{"detector_apps":["io.github.vvb2060.mahoshojo"]}}' > "$HMAOSS_BASE/hide_my_applist_test/preset_cache_v2.json"
cat > "$BIN_DIR/pm" << 'MOCK'
#!/bin/sh
case "$*" in
  *"-3"*) printf 'package:io.github.vvb2060.mahoshojo\npackage:com.live.app\npackage:org.frknkrc44.hma_oss\n' ;;
  *list*packages*) printf 'package:io.github.vvb2060.mahoshojo\npackage:com.live.app\npackage:org.frknkrc44.hma_oss\n' ;;
  *) echo "mock pm $*" ;;
esac
MOCK
chmod +x "$BIN_DIR/pm"
printf '#!/bin/sh\nexit 0\n' > "$BIN_DIR/chown"; chmod +x "$BIN_DIR/chown"
printf '#!/bin/sh\nexit 0\n' > "$BIN_DIR/restorecon"; chmod +x "$BIN_DIR/restorecon"
_hm_det_out=$(run_feature hma.sh)
assert_contains "feature: detector-only cache continues" "$_hm_det_out" "no preset cache apps to exclude"
assert_eq "feature: detector app remains targeted" "True" "$(_hma_pyval "$_hm_cfg_det" "'io.github.vvb2060.mahoshojo' in d['scope']")"
assert_eq "feature: detector target omits detector preset" "['accessibility_apps', 'custom_rom', 'root_apps', 'shizuku_dhizuku', 'sus_apps', 'xposed']" "$(_hma_pyval "$_hm_cfg_det" "sorted(d['scope']['io.github.vvb2060.mahoshojo']['applyPresets'])")"
assert_eq "feature: detector-only cache targets other apps" "True" "$(_hma_pyval "$_hm_cfg_det" "'com.live.app' in d['scope']")"
assert_eq "feature: non-detector target keeps detector preset" "True" "$(_hma_pyval "$_hm_cfg_det" "'detector_apps' in d['scope']['com.live.app']['applyPresets']")"

# ---------- feature: end to end against a fake HMA dir with preset cache ----------
bootstrap
export HMAOSS_BASE="$TEST_ROOT/misc"
source_libs
mkdir -p "$HMAOSS_BASE/hide_my_applist_test"
_hm_cfg="$HMAOSS_BASE/hide_my_applist_test/config.json"
printf '{"configVersion":93,"detailLog":false,"scope":{"com.preexisting":{"useWhitelist":true,"extraAppList":["z"]},"com.stale":{"applyPresets":["root_apps"]}}}' > "$_hm_cfg"
printf '%s' '{"cache":{"root_apps":["me.weishu.kernelsu","com.topjohnwu.magisk"]}}' > "$HMAOSS_BASE/hide_my_applist_test/preset_cache_v2.json"

cat > "$BIN_DIR/pm" << 'MOCK'
#!/bin/sh
case "$*" in
  *"-3"*) printf 'package:com.preexisting\npackage:com.stale\npackage:com.newapp\npackage:me.weishu.kernelsu\npackage:org.frknkrc44.hma_oss\n' ;;
  *list*packages*) printf 'package:com.preexisting\npackage:com.stale\npackage:com.newapp\npackage:me.weishu.kernelsu\npackage:org.frknkrc44.hma_oss\n' ;;
  *) echo "mock pm $*" ;;
esac
MOCK
chmod +x "$BIN_DIR/pm"
printf '#!/bin/sh\nexit 0\n' > "$BIN_DIR/chown"; chmod +x "$BIN_DIR/chown"
printf '#!/bin/sh\nexit 0\n' > "$BIN_DIR/restorecon"; chmod +x "$BIN_DIR/restorecon"

_hm_feat_out=$(run_feature hma.sh)
assert_contains "feature: preset exclusion count" "$_hm_feat_out" "Preset exclusions: 2"
assert_contains "feature: apply hint" "$_hm_feat_out" "applies it automatically on oss-175+"
assert_file_exists "feature: backup written" "${_hm_cfg}.specter.bak"
assert_eq "feature: preexisting whitelist kept" "{'useWhitelist': True, 'extraAppList': ['z']}" "$(_hma_pyval "$_hm_cfg" "str(d['scope']['com.preexisting'])")"
assert_eq "feature: new app targeted" "True" "$(_hma_pyval "$_hm_cfg" "'com.newapp' in d['scope']")"
assert_eq "feature: all 7 presets applied" "['accessibility_apps', 'custom_rom', 'detector_apps', 'root_apps', 'shizuku_dhizuku', 'sus_apps', 'xposed']" "$(_hma_pyval "$_hm_cfg" "sorted(d['scope']['com.newapp']['applyPresets'])")"
assert_eq "feature: applyTemplates empty" "[]" "$(_hma_pyval "$_hm_cfg" "str(d['scope']['com.newapp']['applyTemplates'])")"
assert_eq "feature: stale entry upgraded" "['accessibility_apps', 'custom_rom', 'detector_apps', 'root_apps', 'shizuku_dhizuku', 'sus_apps', 'xposed']" "$(_hma_pyval "$_hm_cfg" "sorted(d['scope']['com.stale']['applyPresets'])")"
assert_eq "feature: hma app not targeted" "False" "$(_hma_pyval "$_hm_cfg" "'org.frknkrc44.hma_oss' in d['scope']")"
assert_eq "feature: preset app not targeted" "False" "$(_hma_pyval "$_hm_cfg" "'me.weishu.kernelsu' in d['scope']")"
assert_eq "feature: configVersion absent" "False" "$(_hma_pyval "$_hm_cfg" "'configVersion' in d")"
assert_eq "feature: defaultConfig set" "False" "$(_hma_pyval "$_hm_cfg" "d.get('defaultConfig') is None")"
assert_eq "feature: defaultConfig 7 presets" "['accessibility_apps', 'custom_rom', 'detector_apps', 'root_apps', 'shizuku_dhizuku', 'sus_apps', 'xposed']" "$(_hma_pyval "$_hm_cfg" "sorted(d['defaultConfig']['applyPresets'])")"

# ---------- feature: old generated template is ignored, detector stays in scope ----------
bootstrap
export HMAOSS_BASE="$TEST_ROOT/misc"
source_libs
mkdir -p "$HMAOSS_BASE/hide_my_applist_test"
_hm_cfg_legacy="$HMAOSS_BASE/hide_my_applist_test/config.json"
printf '{"templates":{"HIDE MY CUSTOM APP":{"isWhitelist":false,"appList":["io.github.vvb2060.mahoshojo"]}},"scope":{"io.github.vvb2060.mahoshojo":{"applyTemplates":["HIDE MY CUSTOM APP"]}}}' > "$_hm_cfg_legacy"
printf '%s' '{"cache":{"root_apps":["me.weishu.kernelsu"],"detector_apps":["io.github.vvb2060.mahoshojo"]}}' > "$HMAOSS_BASE/hide_my_applist_test/preset_cache_v2.json"
cat > "$BIN_DIR/pm" << 'MOCK'
#!/bin/sh
case "$*" in
  *"-3"*) printf 'package:io.github.vvb2060.mahoshojo\npackage:com.live.app\npackage:me.weishu.kernelsu\npackage:org.frknkrc44.hma_oss\n' ;;
  *list*packages*) printf 'package:io.github.vvb2060.mahoshojo\npackage:com.live.app\npackage:me.weishu.kernelsu\npackage:org.frknkrc44.hma_oss\n' ;;
  *) echo "mock pm $*" ;;
esac
MOCK
chmod +x "$BIN_DIR/pm"
printf '#!/bin/sh\nexit 0\n' > "$BIN_DIR/chown"; chmod +x "$BIN_DIR/chown"
printf '#!/bin/sh\nexit 0\n' > "$BIN_DIR/restorecon"; chmod +x "$BIN_DIR/restorecon"
run_feature hma.sh >/dev/null 2>&1
assert_eq "feature: detector stays targeted with old template" "True" "$(_hma_pyval "$_hm_cfg_legacy" "'io.github.vvb2060.mahoshojo' in d['scope']")"
assert_eq "feature: detector gets 6 presets" "['accessibility_apps', 'custom_rom', 'root_apps', 'shizuku_dhizuku', 'sus_apps', 'xposed']" "$(_hma_pyval "$_hm_cfg_legacy" "sorted(d['scope']['io.github.vvb2060.mahoshojo']['applyPresets'])")"
assert_eq "feature: old template reference untouched" "['HIDE MY CUSTOM APP']" "$(_hma_pyval "$_hm_cfg_legacy" "str(d['scope']['io.github.vvb2060.mahoshojo']['applyTemplates'])")"
assert_eq "feature: old template object untouched" "True" "$(_hma_pyval "$_hm_cfg_legacy" "'HIDE MY CUSTOM APP' in d.get('templates', {})")"

# ---------- feature: blacklist keeps an app out of scope ----------
bootstrap
export HMAOSS_BASE="$TEST_ROOT/misc"
source_libs
mkdir -p "$HMAOSS_BASE/hide_my_applist_test"
_hm_cfg2="$HMAOSS_BASE/hide_my_applist_test/config.json"
printf '{}' > "$_hm_cfg2"
printf '%s' '{"cache":{"root_apps":["me.weishu.kernelsu"]}}' > "$HMAOSS_BASE/hide_my_applist_test/preset_cache_v2.json"
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
printf 'com.blocked # comment\n' > "$SPECTER_DIR/blacklist.txt"
: > "$SPECTER_DIR/blacklist_enabled"

run_feature hma.sh >/dev/null 2>&1
assert_eq "feature: blacklisted app skipped" "False" "$(_hma_pyval "$_hm_cfg2" "'com.blocked' in d['scope']")"
assert_eq "feature: allowed app added" "True" "$(_hma_pyval "$_hm_cfg2" "'com.allowed' in d['scope']")"

# ---------- feature: preexisting scope entry for preset cache app pruned ----------
bootstrap
export HMAOSS_BASE="$TEST_ROOT/misc"
source_libs
mkdir -p "$HMAOSS_BASE/hide_my_applist_test"
_hm_cfg5="$HMAOSS_BASE/hide_my_applist_test/config.json"
printf '%s' '{"scope":{"com.hidden":{"applyPresets":["root_apps"]},"com.kept":{"mode":1}}}' > "$_hm_cfg5"
printf '%s' '{"cache":{"root_apps":["com.hidden"]}}' > "$HMAOSS_BASE/hide_my_applist_test/preset_cache_v2.json"
cat > "$BIN_DIR/pm" << 'MOCK'
#!/bin/sh
case "$*" in
  *"-3"*) printf 'package:com.hidden\npackage:com.kept\npackage:org.frknkrc44.hma_oss\n' ;;
  *list*packages*) printf 'package:com.hidden\npackage:com.kept\npackage:org.frknkrc44.hma_oss\n' ;;
  *) echo "mock pm $*" ;;
esac
MOCK
chmod +x "$BIN_DIR/pm"
printf '#!/bin/sh\nexit 0\n' > "$BIN_DIR/chown"; chmod +x "$BIN_DIR/chown"
printf '#!/bin/sh\nexit 0\n' > "$BIN_DIR/restorecon"; chmod +x "$BIN_DIR/restorecon"
run_feature hma.sh >/dev/null 2>&1
assert_eq "feature: preset cache app pruned from scope" "False" "$(_hma_pyval "$_hm_cfg5" "'com.hidden' in d['scope']")"
assert_eq "feature: allowed preexisting app kept in scope" "True" "$(_hma_pyval "$_hm_cfg5" "'com.kept' in d['scope']")"
assert_eq "feature: allowed preexisting app normalized" "7" "$(_hma_pyval "$_hm_cfg5" "len(d['scope']['com.kept']['applyPresets'])")"

# ---------- feature: preexisting scope entry for blacklisted app pruned ----------
bootstrap
export HMAOSS_BASE="$TEST_ROOT/misc"
source_libs
mkdir -p "$HMAOSS_BASE/hide_my_applist_test" "$SPECTER_DIR"
_hm_cfg_bl="$HMAOSS_BASE/hide_my_applist_test/config.json"
printf '%s' '{"scope":{"com.already.blacklisted":{"applyPresets":["root_apps"]},"com.stay.kept":{"mode":1}}}' > "$_hm_cfg_bl"
printf 'com.already.blacklisted\n' > "$SPECTER_DIR/blacklist.txt"
: > "$SPECTER_DIR/blacklist_enabled"
cat > "$BIN_DIR/pm" << 'MOCK'
#!/bin/sh
case "$*" in
  *"-3"*) printf 'package:com.already.blacklisted\npackage:com.stay.kept\npackage:org.frknkrc44.hma_oss\n' ;;
  *list*packages*) printf 'package:com.already.blacklisted\npackage:com.stay.kept\npackage:org.frknkrc44.hma_oss\n' ;;
  *) echo "mock pm $*" ;;
esac
MOCK
chmod +x "$BIN_DIR/pm"
printf '#!/bin/sh\nexit 0\n' > "$BIN_DIR/chown"; chmod +x "$BIN_DIR/chown"
printf '#!/bin/sh\nexit 0\n' > "$BIN_DIR/restorecon"; chmod +x "$BIN_DIR/restorecon"
run_feature hma.sh >/dev/null 2>&1
assert_eq "feature: preexisting blacklisted app pruned from scope" "False" "$(_hma_pyval "$_hm_cfg_bl" "'com.already.blacklisted' in d['scope']")"
assert_eq "feature: non-blacklisted preexisting app kept in scope" "True" "$(_hma_pyval "$_hm_cfg_bl" "'com.stay.kept' in d['scope']")"

# ---------- feature: watcher debounce and lock ----------
bootstrap
export HMAOSS_BASE="$TEST_ROOT/misc"
source_libs
mkdir -p "$HMAOSS_BASE/hide_my_applist_test" "$SPECTER_DIR/scheduler_tasks"
printf '%s' "$(date +%s)" > "$SPECTER_DIR/scheduler_tasks/hma_watch_last"
_hm_watch_quiet=$(run_feature hma.sh --watch)
assert_eq "watch: debounced run is silent" "" "$_hm_watch_quiet"
printf '0' > "$SPECTER_DIR/scheduler_tasks/hma_watch_last"
_hm_watch_old=$(run_feature hma.sh --watch)
assert_contains "watch: stale stamp runs" "$_hm_watch_old" "HMA-OSS not installed"
mkdir -p "$SPECTER_DIR/.hma.lock"
printf '%s' "$$" > "$SPECTER_DIR/.hma.lock/pid"
_hm_watch_locked=$(run_feature hma.sh)
assert_eq "watch: active lock skips" "" "$_hm_watch_locked"
rm -rf "$SPECTER_DIR/.hma.lock"

# ---------- feature: hma not installed is a no-op ----------
bootstrap
export HMAOSS_BASE="$TEST_ROOT/misc"
source_libs
_hm_missing_out=$(run_feature hma.sh)
assert_contains "feature: not-installed notice" "$_hm_missing_out" "HMA-OSS not installed"

# ---------- feature: --list-raw and --set <file> ----------
bootstrap
export HMAOSS_BASE="$TEST_ROOT/misc"
source_libs
mkdir -p "$HMAOSS_BASE/hide_my_applist_test"
_hm_cfg_set="$HMAOSS_BASE/hide_my_applist_test/config.json"
printf '{"scope":{"com.existing.target":{"applyPresets":["root_apps"]},"com.my.whitelist":{"useWhitelist":true}}}' > "$_hm_cfg_set"

cat > "$BIN_DIR/pm" << 'MOCK'
#!/bin/sh
case "$*" in
  *"-3"*) printf 'package:com.existing.target\npackage:com.new.target\npackage:com.my.whitelist\npackage:com.blacklisted.target\npackage:org.frknkrc44.hma_oss\n' ;;
  *list*packages*) printf 'package:com.existing.target\npackage:com.new.target\npackage:com.my.whitelist\npackage:com.blacklisted.target\npackage:org.frknkrc44.hma_oss\n' ;;
  *) echo "mock pm $*" ;;
esac
MOCK
chmod +x "$BIN_DIR/pm"
printf '#!/bin/sh\nexit 0\n' > "$BIN_DIR/chown"; chmod +x "$BIN_DIR/chown"
printf '#!/bin/sh\nexit 0\n' > "$BIN_DIR/restorecon"; chmod +x "$BIN_DIR/restorecon"

_hm_raw_list=$(run_feature hma.sh --list-raw)
assert_contains "list-raw: contains existing target" "$_hm_raw_list" "com.existing.target"
assert_contains "list-raw: contains whitelist entry" "$_hm_raw_list" "com.my.whitelist"

# Test --set with new target, dropping existing target, preserving whitelist, and filtering blacklist
printf 'com.blacklisted.target\n' > "$SPECTER_DIR/blacklist.txt"
: > "$SPECTER_DIR/blacklist_enabled"
printf 'com.new.target\ncom.blacklisted.target\n' > "$TEST_ROOT/user_selection.txt"

run_feature hma.sh --set "$TEST_ROOT/user_selection.txt" >/dev/null 2>&1
assert_eq "set: new target added" "True" "$(_hma_pyval "$_hm_cfg_set" "'com.new.target' in d['scope']")"
assert_eq "set: unselected target dropped" "False" "$(_hma_pyval "$_hm_cfg_set" "'com.existing.target' in d['scope']")"
assert_eq "set: whitelist app preserved" "True" "$(_hma_pyval "$_hm_cfg_set" "'com.my.whitelist' in d['scope']")"
assert_eq "set: blacklisted target filtered out" "False" "$(_hma_pyval "$_hm_cfg_set" "'com.blacklisted.target' in d['scope']")"
assert_file_not_exists "set: staging file consumed" "$TEST_ROOT/user_selection.txt"

done_testing
