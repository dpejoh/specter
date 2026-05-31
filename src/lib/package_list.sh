# shellcheck shell=sh disable=SC2034
FIXED_TARGETS="android"

DETECTOR_APPS="com.zhenxi.hunter icu.nullptr.nativetest icu.nullptr.applistdetector com.byxiaorun.detector io.github.huskydg.memorydetector com.OrangeEnvironment.Detector com.Longze.detector.pro2 rikka.safetynetchecker io.github.vvb2060.keyattestation io.github.vvb2060.mahoshojo com.lingqing.detector aidepro.top com.junge.algorithmAidePro chunqiu.safe luna.safe.luna io.liankong.riskdetector com.studio.duckdetector com.android.nativetest com.byyoung.setting com.scottyab.rootbeer com.scottyab.rootbeer.sample com.topjohnwu.magisk.detector com.devadvance.rootcloak com.fde.xposed.detector com.zhenxi.checker com.example.nativelibtest com.example.memcheck com.example.syscallchecker com.jrummyapps.rootchecker com.kimchangyoun.magiskdetector com.reveny.nativechecker com.reveny.environmentchecker com.reveny.rootchecker com.guardian.detect com.security.environmentchecker com.integrity.checker com.integrity.attestation com.lody.virtual com.lody.virtual.client com.lody.virtual.server com.lody.whale com.kimchangyoun.rootbeerfresh com.didikee.rootcheck com.joeykrim.rootcheck com.freeandroidtools.rootchecker com.bluestacks.rootchecker com.moonshine.checker com.ramdroid.appdetector com.smlj.rootcheck com.devadvance.rootcloakplus com.formyhm.hideroot com.example.emulatordetector com.vmcheck.detector com.virtual.checker com.antivm.detector com.xposed.checker com.google.snet.test com.attestation.checker com.integrity.check com.native.checker com.syscall.detector com.memory.scan me.garfieldhan.holmes com.eltavine.duckdetector"

GMS_APPS="com.android.vending com.google.android.gsf com.google.android.gms com.google.android.contactkeys com.google.android.ims com.google.android.safetycore com.google.android.apps.walletnfcrel com.google.android.apps.nbu.paisa.user"

GMS_KILL_LIST="com.android.vending com.google.android.gms com.google.android.gms.persistent com.google.android.gms.unstable com.google.android.gsf com.google.android.ims com.google.android.contactkeys com.google.android.safetycore com.google.android.rkpdapp com.android.chrome com.google.android.googlequicksearchbox"

REMOTE_CONTROL_APPS="com.anydesk.anydeskandroid com.teamviewer.teamviewer.market.mobile com.teamviewer.quicksupport.market com.sand.airdroid com.sand.airmirror com.koushikdutta.vysor com.genymobile.scrcpy com.microsoft.rdc.androidx com.realvnc.viewer.android com.splashtop.remote.pad.v2 com.dwservice.dwagent com.carriez.flutter_hbb com.carriez.flutter_hbbclient com.rustdesk.rustdesk"

TOOL_APPS="bin.mt.plus bin.mt.plus.canary com.omarea.vtools moe.shizuku.privileged.api com.estrongs.android.pop com.coolapk.market com.sevtinge.hyperceiler com.coderstory.toolkit"

BLACKLIST_EXTRA="com.android.chrome com.google.android.apps.photos com.google.android.youtube com.topjohnwu.magisk mmrl"

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
