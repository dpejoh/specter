package com.dpejoh.specter;

import android.os.Build;
import android.os.Process;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Fast setup snapshot generator. Runs through app_process so the WebUI does not
 * spawn dozens of shell utilities (each ~100 ms on Android).
 *
 * Usage: SetupProbe <module-dir> <specter-data-dir> <output-json>
 */
public final class SetupProbe {
    private static final String MODULES = "/data/adb/modules";

    private SetupProbe() {}

    public static void main(String[] args) {
        try {
            String moduleDir = args.length > 0 ? args[0] : MODULES + "/specter";
            String dataDir = args.length > 1 ? args[1] : "/data/adb/specter";
            String output = args.length > 2 ? args[2] : moduleDir + "/webroot/json/setup_info.json";

            JSONObject root = build(moduleDir, dataDir);
            writeAtomic(output, root.toString(2));
            System.out.println("Setup snapshot written to " + output);
        } catch (Throwable t) {
            t.printStackTrace();
            System.exit(1);
        }
    }

    private static JSONObject build(String moduleDir, String dataDir) throws Exception {
        JSONObject root = new JSONObject();
        root.put("generated_at", utcNow());

        String patch = effectivePatch();
        JSONObject device = new JSONObject();
        device.put("android", text(Build.VERSION.RELEASE));
        device.put("root", rootType());
        device.put("specter", prop(new File(moduleDir, "module.prop"), "version"));
        device.put("effective_patch", patch);
        root.put("device", device);

        JSONArray modules = new JSONArray();
        JSONArray features = new JSONArray();
        JSONArray warnings = new JSONArray();

        Keystore keystore = detectKeystore(dataDir);
        modules.put(keystoreModule(keystore));
        if ("none".equals(keystore.id)) warnings.put("No supported keystore backend detected");

        File pifDir = new File(MODULES, "playintegrityfix");
        boolean pifPresent = new File(pifDir, "module.prop").isFile();
        if (pifPresent) {
            modules.put(pifModule(pifDir));
        }

        File hmaDir = findHmaDir();
        boolean hmaPresent = hmaDir != null;
        if (hmaPresent) {
            try {
                modules.put(hmaModule(hmaDir));
            } catch (Exception e) {
                hmaPresent = false;
                warnings.put("HMA-OSS config could not be read");
            }
        }

        File zygiskDir = new File(MODULES, "zygisksu");
        if (new File(zygiskDir, "module.prop").isFile()) {
            modules.put(simpleModule("zygisk", zygiskDir, "Zygisk Next",
                    enabled(zygiskDir) ? "Enabled" : "Disabled"));
        }

        addFeature(features, "Auto Target", dataDir, "toggle_auto_target", "1",
                "auto_target_interval", "300");
        addFeature(features, "Keybox revocation watch", dataDir, "toggle_keybox_info", "1",
                "keybox_watch_interval", "300");
        addFeature(features, "Auto Keybox", dataDir, "toggle_autokeybox", "0",
                "autokeybox_interval", "86400");
        if (hmaPresent) {
            addFeature(features, "Auto HMA config", dataDir, "toggle_auto_hma", "0",
                    "hma_interval", "21600");
        }
        if (pifPresent) addFeature(features, "Auto PIF", dataDir, "toggle_autopif", "0", null, null);
        addFeature(features, "Security patch action", dataDir, "toggle_action_security_patch", "0",
                null, null);

        File keyboxInfo = new File(moduleDir, "webroot/json/keybox_info.json");
        if (keyboxInfo.isFile()) {
            try {
                JSONObject kb = new JSONObject(read(keyboxInfo));
                if (!kb.optBoolean("installed", true)) warnings.put("No keybox is installed");
                if (kb.optBoolean("revoked", false)) warnings.put("The installed keybox is revoked");
                if (kb.optBoolean("expired", false)) warnings.put("The installed keybox is expired");
            } catch (Exception ignored) {
                // A malformed runtime snapshot must not hide the rest of setup.
            }
        }

        root.put("modules", modules);
        root.put("features", features);
        root.put("warnings", warnings);
        return root;
    }

    private static JSONObject keystoreModule(Keystore keystore) throws Exception {
        JSONArray rows = new JSONArray();
        rows.put(row("State", keystore.state));
        if (!"none".equals(keystore.id)) {
            rows.put(row("Target count", String.valueOf(keystore.targetCount)));
            for (String[] extra : keystore.extraRows) rows.put(row(extra[0], extra[1]));
        }
        JSONObject module = new JSONObject();
        module.put("id", "keystore");
        module.put("name", keystore.name);
        module.put("version", keystore.version);
        module.put("rows", rows);
        return module;
    }

    private static JSONObject pifModule(File pifDir) throws Exception {
        String model = pifValue("MODEL");
        String manufacturer = pifValue("MANUFACTURER");
        String spoofed = (manufacturer + " " + model).trim();

        JSONArray rows = new JSONArray();
        rows.put(row("State", enabled(pifDir) ? "Enabled" : "Disabled"));
        rows.put(row("Spoofed device", spoofed.isEmpty() ? "—" : spoofed));

        JSONObject module = new JSONObject();
        module.put("id", "pif");
        module.put("name", nonEmpty(prop(new File(pifDir, "module.prop"), "name"), "Play Integrity Fix"));
        module.put("version", prop(new File(pifDir, "module.prop"), "version"));
        module.put("rows", rows);
        return module;
    }

    private static JSONObject hmaModule(File hmaDir) throws Exception {
        JSONObject config = new JSONObject(read(new File(hmaDir, "config.json")));
        JSONObject scope = config.optJSONObject("scope");
        int scopeCount = scope == null ? 0 : scope.length();
        String version = hmaVersion();
        boolean autoReload = autoReloadVersion(version);

        JSONArray rows = new JSONArray();
        rows.put(row("Scope entries", String.valueOf(scopeCount)));
        rows.put(row("Auto-reload", autoReload ? "Yes" : "No"));

        JSONObject module = new JSONObject();
        module.put("id", "hma");
        module.put("name", "HMA-OSS");
        module.put("version", version);
        module.put("rows", rows);
        return module;
    }

    private static String hmaVersion() {
        for (String id : new String[]{"hma_oss_zygisk", "hma_oss"}) {
            for (String base : new String[]{MODULES, MODULES + "_update"}) {
                String version = prop(new File(base + "/" + id, "module.prop"), "version");
                if (!version.isEmpty()) return version;
            }
        }
        return "";
    }

    private static boolean autoReloadVersion(String version) {
        Matcher matcher = Pattern.compile("(\\d+)").matcher(version);
        return matcher.find() && Integer.parseInt(matcher.group(1)) >= 175;
    }

    private static JSONObject simpleModule(String id, File dir, String fallbackName, String state)
            throws Exception {
        JSONArray rows = new JSONArray();
        rows.put(row("State", state));
        JSONObject module = new JSONObject();
        module.put("id", id);
        module.put("name", nonEmpty(prop(new File(dir, "module.prop"), "name"), fallbackName));
        module.put("version", prop(new File(dir, "module.prop"), "version"));
        module.put("rows", rows);
        return module;
    }

    private static void addFeature(JSONArray features, String label, String dataDir,
                                   String toggleKey, String toggleDefault,
                                   String intervalKey, String intervalDefault) throws Exception {
        String value = onOff(cfg(dataDir, toggleKey, toggleDefault));
        if (intervalKey != null) {
            value += " · " + interval(cfg(dataDir, intervalKey, intervalDefault));
        }
        JSONObject feature = new JSONObject();
        feature.put("label", label);
        feature.put("value", value);
        features.put(feature);
    }

    private static Keystore detectKeystore(String dataDir) {
        String override = cfg(dataDir, "keystore_manager", "auto");
        if (!"auto".equals(override)) {
            Keystore forced = keystoreFor(override);
            if (forced != null) return forced;
        }
        for (String id : new String[]{"teesim", "trickystore", "omk"}) {
            Keystore found = keystoreFor(id);
            if (found != null) return found;
        }
        return Keystore.none();
    }

    private static Keystore keystoreFor(String id) {
        String moduleId;
        String name;
        String format;
        File moduleDir;
        File targetFile;
        File configFile;
        if ("teesim".equals(id)) {
            moduleId = "teesim";
            name = "TEESimulator";
            format = "json";
            moduleDir = new File(MODULES, moduleId);
            targetFile = new File("/data/adb/teesim/config.json");
            configFile = targetFile;
        } else if ("trickystore".equals(id)) {
            moduleId = "tricky_store";
            name = "Tricky Store";
            moduleDir = new File(MODULES, moduleId);
            targetFile = new File("/data/adb/tricky_store/target.txt");
            File ini = new File("/data/adb/tricky_store/config.ini");
            format = ini.isFile() ? "ini" : "txt";
            if (ini.isFile()) targetFile = ini;
            configFile = ini.isFile() ? ini : new File("/data/adb/tricky_store/security_patch.txt");
        } else if ("omk".equals(id)) {
            moduleId = "oh_my_keymint";
            name = "OhMyKeymint";
            format = "toml";
            moduleDir = new File(MODULES, moduleId);
            targetFile = new File("/data/misc/keystore/omk/injector.toml");
            configFile = new File("/data/misc/keystore/omk/config.toml");
        } else {
            return null;
        }
        if (!new File(moduleDir, "module.prop").isFile()) return null;

        String moduleName = nonEmpty(prop(new File(moduleDir, "module.prop"), "name"), name);
        String version = prop(new File(moduleDir, "module.prop"), "version");
        boolean isEnabled = enabled(moduleDir);
        int targetCount = countTargets(format, targetFile);
        List<String[]> extra = new ArrayList<>();
        if ("omk".equals(id)) addOmkRows(extra, configFile, targetFile);
        return new Keystore(id, moduleName, version, isEnabled ? "Enabled" : "Disabled",
                targetCount, extra);
    }

    private static void addOmkRows(List<String[]> rows, File config, File injector) {
        String text = read(config);
        rows.add(new String[]{"Log level", nonEmpty(propText(text, "log_level"), "—")});
        rows.add(new String[]{"Reported OS version", nonEmpty(propText(text, "os_version"), "—")});
        rows.add(new String[]{"Trust security patch", nonEmpty(propText(text, "security_patch"), "—")});
        rows.add(new String[]{"Verified boot state", nonEmpty(propText(text, "verified_boot_state"), "—")});
        rows.add(new String[]{"Device locked", nonEmpty(propText(text, "device_locked"), "—")});
        rows.add(new String[]{"Scoop packages", String.valueOf(scoopCount(read(injector)))});
    }

    private static int countTargets(String format, File file) {
        if (file == null || !file.isFile()) return 0;
        String text = read(file);
        if ("json".equals(format)) {
            try {
                JSONObject config = new JSONObject(text);
                JSONObject profiles = config.optJSONObject("profiles");
                JSONObject profile = profiles == null ? null : profiles.optJSONObject("default");
                JSONArray apps = profile == null ? null : profile.optJSONArray("apps");
                return apps == null ? 0 : apps.length();
            } catch (Exception ignored) {
                return 0;
            }
        }
        if ("toml".equals(format)) return scoopCount(text);
        if ("ini".equals(format)) {
            int count = 0;
            boolean target = false;
            for (String line : text.split("\\R")) {
                String value = line.trim();
                if (value.startsWith("[")) {
                    target = value.equals("[target]");
                    continue;
                }
                if (target && !value.isEmpty() && !value.startsWith("#")) count++;
            }
            return count;
        }
        int count = 0;
        for (String line : text.split("\\R")) {
            String value = line.trim();
            if (!value.isEmpty() && !value.startsWith("#") && !value.startsWith("[")) count++;
        }
        return count;
    }

    private static int scoopCount(String text) {
        int start = text.indexOf("scoop");
        if (start < 0) return 0;
        int open = text.indexOf('[', start);
        int close = text.indexOf(']', open + 1);
        if (open < 0 || close < 0) return 0;
        Matcher matcher = Pattern.compile("\"([^\"]+)\"").matcher(text.substring(open + 1, close));
        int count = 0;
        while (matcher.find()) count++;
        return count;
    }

    private static File findHmaDir() {
        File misc = new File("/data/misc");
        File[] children = misc.listFiles();
        if (children == null) return null;
        for (File child : children) {
            if (child.isDirectory() && child.getName().startsWith("hide_my_applist")
                    && new File(child, "config.json").isFile()) {
                return child;
            }
        }
        return null;
    }

    private static String effectivePatch() {
        File tricky = new File("/data/adb/tricky_store");
        File patchFile = new File(tricky, "security_patch.txt");
        if (patchFile.isFile()) {
            String patchText = read(patchFile);
            String boot = lineValue(patchText, "boot");
            if (boot.isEmpty()) boot = lineValue(patchText, "all");
            if (boot.isEmpty()) boot = patchText.trim();
            if (!boot.isEmpty()) return boot;
        }
        File ini = new File(tricky, "config.ini");
        if (ini.isFile()) {
            String patch = iniBootPatch(read(ini));
            if (!patch.isEmpty()) return patch;
        }
        File teesim = new File("/data/adb/teesim/config.json");
        if (teesim.isFile()) {
            try {
                JSONObject profile = new JSONObject(read(teesim)).optJSONObject("profiles")
                        .optJSONObject("default");
                JSONObject level = profile == null ? null : profile.optJSONObject("patchLevel");
                String boot = level == null ? "" : level.optString("boot", "");
                if (!boot.isEmpty()) return boot;
            } catch (Exception ignored) {}
        }
        File omk = new File("/data/misc/keystore/omk/config.toml");
        if (omk.isFile()) {
            String trust = propText(read(omk), "security_patch");
            if (!trust.isEmpty()) return trust;
        }
        return text(Build.VERSION.SECURITY_PATCH);
    }

    private static String lineValue(String text, String key) {
        Matcher matcher = Pattern.compile("(?m)^\\s*" + Pattern.quote(key) + "\\s*=\\s*(.+?)\\s*$")
                .matcher(text);
        if (!matcher.find()) return "";
        String value = matcher.group(1).trim();
        if (value.startsWith("\"") && value.endsWith("\"")) {
            value = value.substring(1, value.length() - 1);
        }
        return value;
    }

    private static String iniBootPatch(String text) {
        boolean inPolicy = false;
        for (String line : text.split("\\R")) {
            String value = line.trim();
            if (value.startsWith("[")) {
                inPolicy = value.equals("[default_policy]");
                continue;
            }
            if (inPolicy && value.startsWith("boot_patch")) {
                String patch = value.substring(value.indexOf('=') + 1).trim();
                if (patch.matches("\\d{8}")) {
                    return patch.substring(0, 4) + "-" + patch.substring(4, 6) + "-" + patch.substring(6, 8);
                }
                return patch;
            }
        }
        return "";
    }

    private static String pifValue(String key) {
        String[] paths = {
                "/data/adb/pif.prop",
                MODULES + "/playintegrityfix/custom.pif.prop",
                "/data/adb/pif.json",
                MODULES + "/playintegrityfix/pif.json",
                MODULES + "/playintegrityfix/autopif.json",
                MODULES + "/playintegrityfix/custom.pif.json",
        };
        for (String path : paths) {
            File file = new File(path);
            if (!file.isFile()) continue;
            String text = read(file);
            String value = path.endsWith(".json") ? jsonValue(text, key) : propText(text, key);
            if (!value.isEmpty()) return value;
        }
        return "";
    }

    private static String jsonValue(String text, String key) {
        Matcher matcher = Pattern.compile("\"" + Pattern.quote(key) + "\"\\s*:\\s*\"([^\"]*)\"").matcher(text);
        return matcher.find() ? matcher.group(1) : "";
    }

    private static String propText(String text, String key) {
        Matcher matcher = Pattern.compile("(?m)^\\s*" + Pattern.quote(key) + "\\s*=\\s*\"?([^\"\\r\\n]*)\"?\\s*$")
                .matcher(text);
        return matcher.find() ? matcher.group(1).trim() : "";
    }

    private static String rootType() {
        if (new File("/data/adb/ap").isDirectory()) return "APatch";
        if (new File("/data/adb/ksu").isDirectory()) return "KernelSU";
        if (new File("/data/adb/magisk").isFile() || new File("/data/adb/magisk.db").isFile()) return "Magisk";
        return "Unknown";
    }

    private static String cfg(String dataDir, String key, String fallback) {
        File file = new File(dataDir, "config/val/" + key + ".val");
        String value = readTrim(file);
        return value.isEmpty() ? fallback : value;
    }

    private static String onOff(String value) {
        return "1".equals(value) ? "On" : "Off";
    }

    private static String interval(String raw) {
        try {
            long seconds = Long.parseLong(raw);
            if (seconds >= 3600) return (seconds / 3600) + " h";
            if (seconds >= 60) return (seconds / 60) + " min";
            return seconds + " s";
        } catch (Exception ignored) {
            return raw + " s";
        }
    }

    private static JSONObject row(String label, String value) throws Exception {
        JSONObject row = new JSONObject();
        row.put("label", label);
        row.put("value", value);
        return row;
    }

    private static String prop(File file, String key) {
        return propText(read(file), key);
    }

    private static boolean enabled(File moduleDir) {
        return moduleDir.isDirectory() && !new File(moduleDir, "disable").exists();
    }

    private static String read(File file) {
        try {
            return new String(Files.readAllBytes(file.toPath()), StandardCharsets.UTF_8);
        } catch (Exception ignored) {
            return "";
        }
    }

    private static String readTrim(File file) {
        return read(file).trim();
    }

    private static String nonEmpty(String value, String fallback) {
        return value == null || value.isEmpty() ? fallback : value;
    }

    private static String text(String value) {
        return value == null ? "" : value;
    }

    private static String utcNow() {
        java.text.SimpleDateFormat format = new java.text.SimpleDateFormat(
                "yyyy-MM-dd'T'HH:mm:ss'Z'", java.util.Locale.US);
        format.setTimeZone(java.util.TimeZone.getTimeZone("UTC"));
        return format.format(new java.util.Date());
    }

    private static void writeAtomic(String output, String content) throws Exception {
        File target = new File(output);
        File parent = target.getParentFile();
        if (parent != null && !parent.isDirectory()) parent.mkdirs();
        File tmp = new File(output + ".tmp." + Process.myPid());
        Files.write(tmp.toPath(), content.getBytes(StandardCharsets.UTF_8));
        try {
            Files.move(tmp.toPath(), target.toPath(), StandardCopyOption.REPLACE_EXISTING,
                    StandardCopyOption.ATOMIC_MOVE);
        } catch (Exception ignored) {
            Files.move(tmp.toPath(), target.toPath(), StandardCopyOption.REPLACE_EXISTING);
        }
        try {
            target.setReadable(true, false);
        } catch (Exception ignored) {}
    }

    private static final class Keystore {
        final String id;
        final String name;
        final String version;
        final String state;
        final int targetCount;
        final List<String[]> extraRows;

        Keystore(String id, String name, String version, String state,
                 int targetCount, List<String[]> extraRows) {
            this.id = id;
            this.name = name;
            this.version = version;
            this.state = state;
            this.targetCount = targetCount;
            this.extraRows = extraRows;
        }

        static Keystore none() {
            return new Keystore("none", "Keystore backend", "", "Not installed", 0,
                    new ArrayList<String[]>());
        }
    }
}
