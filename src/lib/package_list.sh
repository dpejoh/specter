# shellcheck shell=sh disable=SC2034
GMS_APPS="com.android.vending com.google.android.gsf com.google.android.gms com.google.android.contactkeys com.google.android.ims com.google.android.safetycore com.google.android.apps.walletnfcrel com.google.android.apps.nbu.paisa.user"
FIXED_TARGETS="android $GMS_APPS"

GMS_KILL_LIST="$GMS_APPS com.google.android.gms.persistent com.google.android.gms.unstable com.google.android.rkpdapp com.android.chrome com.google.android.googlequicksearchbox"

TOOL_APPS="bin.mt.plus bin.mt.plus.canary com.omarea.vtools moe.shizuku.privileged.api com.estrongs.android.pop com.coolapk.market com.sevtinge.hyperceiler com.coderstory.toolkit"

SUSPICIOUS_PROPS="\
persist.hyperceiler.log.level|warning|HyperCeiler modding tool persistent log
persist.sys.vold_app_data_isolation_enabled|warning|App data isolation leak from modding tool
persist.zygote.app_data_isolation|critical|Zygote data isolation, root-level hooking artifact
persist.com.luckyzyx.luckytool.log.level|warning|LuckyTool Xposed module debug log
persist.com.luckyzyx.luckytool.debug|warning|LuckyTool Xposed module debug mode
persist.com.luckyzyx.luckytool.enable|warning|LuckyTool Xposed module enabled state
persist.sys.developer_options|warning|Developer options were previously enabled
persist.sys.xposed|critical|Xposed framework persistent state detected
persist.sys.edxposed|critical|EdXposed framework persistent state detected
persist.sys.lsposed|critical|LSPosed framework persistent state detected
persist.sys.root_access|critical|Root access persistent flag detected
persist.sys.root_mode|critical|Root mode persistent flag detected"
