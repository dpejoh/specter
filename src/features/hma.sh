#!/system/bin/sh
set -e
MODDIR=${0%/*}
. "$MODDIR/../lib/common.sh"
. "$MODDIR/../lib/paths.sh"
. "$MODDIR/../lib/urls.sh"

log "HMA" "Start"

_installed_pkgs=$(pm list packages 2>/dev/null) || log "HMA" "Warning: Failed to list installed packages"

_injected=false

if echo "$_installed_pkgs" | grep -q "org.frknkrc44.hma_oss"; then
  _target_dir="$HMA_DIR"
  _target_file="$HMA_FILE"
  _found="HMA-OSS"
elif echo "$_installed_pkgs" | grep -q "com.tsng.hidemyapplist"; then
  _target_dir="/data/user/0/com.tsng.hidemyapplist/files"
  _target_file="$_target_dir/config.json"
  _found="HMA"
elif echo "$_installed_pkgs" | grep -q "com.google.android.hmal"; then
  _target_dir="/data/user/0/com.google.android.hmal/files"
  _target_file="$_target_dir/config.json"
  _found="HMAL"
else
  log "HMA" "No HMA variant installed, skipping"
  unset _installed_pkgs
  log "HMA" "Finish"
  exit 0
fi

log "HMA" "Found $_found"

if check_network; then
  ensure_dir "$_target_dir"
  _downloaded=$(download "$HMA_CONFIG_URL" 2>/dev/null)
  if [ -n "$_downloaded" ]; then
    printf '%s' "$_downloaded" > "$_target_file" 2>/dev/null && log "HMA" "Config downloaded and written to $_found"
    chmod 600 "$_target_file" 2>/dev/null
    _uid=$(stat -c "%u" "$_target_dir" 2>/dev/null) || _uid=0
    chown "$_uid:$_uid" "$_target_file" 2>/dev/null
    _injected=true
  fi
  [ "$_injected" != "true" ] && log "HMA" "Download failed, using built-in template"
fi

if [ "$_injected" != "true" ]; then
  log "HMA" "Writing built-in template"
  ensure_dir "$_target_dir"
  cat > "$_target_file" <<'TEMPLATE'
{"configVersion":93,"detailLog":false,"errorOnlyLog":false,"maxLogSize":256,"forceMountData":true,"disableActivityLaunchProtection":false,"altAppDataIsolation":true,"altVoldAppDataIsolation":false,"skipSystemAppDataIsolation":true,"packageQueryWorkaround":false,"templates":{"HIDE MY CUSTOM APP":{"isWhitelist":false,"appList":["com.zhenxi.hunter","com.byxiaorun.detector","io.github.lsposed.disableflagsecure","io.github.vvb2060.mahoshojo","io.liankong.riskdetector","io.github.rabehx.securify","com.thend.integritychecker","bin.mt.plus.canary","com.android.nativetest","icu.nullptr.nativetest","com.coderstory.toolkit","com.sukisu.ultra","com.tencent.docs","me.garfieldhan.holmes","com.github.capntrips.kernelflasher","com.reveny.nativecheck","gr.nikolasspyr.integritycheck","io.github.chsbuffer.revancedxposed","com.my.televip","io.github.vvb2060.keyattestation","com.henrikherzig.playintegritychecker","krypton.tbsafetychecker","com.youhu.laifu","com.tsng.applistdetector","com.kikyps.crackme","com.jc","io.github.a13e300.ksuwebui","io.github.huskydg.memorydetector","com.godevelopers.OprekCek","id.my.pjm.qbcd_okr_dvii","luna.safe.luna","me.yuri.ok","icu.nullptr.nativetext","com.tsng.hidemyapplist","com.zrt.xposed","xzr.hkf","com.android.shell","com.dergoogler.mmrl","com.dergoogler.mmrl.wx","com.aurora.store.nightly","io.github.vvb2060.magisk","com.luckyzyx.luckytool","com.topjohnwu.magisk","com.anydesk.anydeskandroid","com.teamviewer.quicksupport.market","com.teamviewer.teamviewer.market.mobile","icu.nullptr.applistdetector","com.omarea.vtools","bin.mt.plus","me.weishu.kernelsu","gvbtcl.yubbjm.qajtjy","tsfvdj.xiwtkz.wuhyrv","com.android.kernel","com.rem01gaming.disclosure","eu.thedarken.sdm","eu.darken.sdmse","moe.shizuku.privileged.api","com.termux","com.thor.nonroot","top.ltfan.notdeveloper"]}},"scope":{"icu.nullptr.applistdetector":{"useWhitelist":false,"excludeSystemApps":false,"hideInstallationSource":false,"hideSystemInstallationSource":false,"excludeTargetInstallationSource":false,"invertActivityLaunchProtection":false,"excludeVoldIsolation":false,"restrictedZygotePermissions":[],"applyTemplates":["HIDE MY CUSTOM APP"],"applyPresets":["custom_rom","root_apps","sus_apps","xposed"],"applySettingTemplates":[],"applySettingsPresets":["accessibility","dev_options"],"extraAppList":[],"extraOppositeAppList":[]},"krypton.tbsafetychecker":{"useWhitelist":false,"excludeSystemApps":true,"hideInstallationSource":false,"hideSystemInstallationSource":false,"excludeTargetInstallationSource":false,"invertActivityLaunchProtection":false,"excludeVoldIsolation":false,"restrictedZygotePermissions":[],"applyTemplates":["HIDE MY CUSTOM APP"],"applyPresets":["custom_rom","detector_apps","root_apps","shizuku_dhizuku","sus_apps","xposed"],"applySettingTemplates":[],"applySettingsPresets":["accessibility","dev_options","input_method"],"extraAppList":["oj.jglv.wblgy.cwzh","org.frknkrc44.hma_oss","com.topmiaohan.superlist"],"extraOppositeAppList":[]}},"settingsTemplates":{}}
TEMPLATE
  chmod 600 "$_target_file" 2>/dev/null
  _uid=$(stat -c "%u" "$_target_dir" 2>/dev/null) || _uid=0
  chown "$_uid:$_uid" "$_target_file" 2>/dev/null
  log "HMA" "Built-in template written"
fi

unset _installed_pkgs _target_dir _target_file _found _injected _uid _downloaded
log "HMA" "Finish"
exit 0
