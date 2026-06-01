#!/system/bin/sh
MODDIR=${0%/*}
. "$MODDIR/lib/common.sh"
. "$MODDIR/lib/paths.sh"
. "$MODDIR/lib/config_env.sh"

PIPELINE="$1"
PIPELINE_FILE="$MODDIR/pipelines/$PIPELINE"

[ -z "$PIPELINE" ] && die "No pipeline specified"
[ ! -f "$PIPELINE_FILE" ] && die "Pipeline not found: $PIPELINE"

while IFS= read -r line; do
    [ -z "$line" ] && continue
    [ "${line#\#}" != "$line" ] && continue

    # Parse toggle gating: toggle:config_key feature args...
    _toggle=""
    case "$line" in
      toggle:*)
        _toggle="${line#toggle:}"
        line="${_toggle#* }"
        _toggle="${_toggle%% *}"
        ;;
    esac

    [ -z "$_toggle" ] || [ "$(cfg_get "$_toggle" 0)" != "0" ] || continue
    unset _toggle

    # Parse feature name and optional args
    set -- $line
    feature="$1"; shift
    _args="$*"

    optional=false
    [ "${feature%\?}" != "$feature" ] && optional=true && feature="${feature%\?}"

    case "$feature" in *[!/a-zA-Z0-9_.-]*) die "Invalid feature name: $feature" ;; esac
    FEATURE_PATH="$MODDIR/features/$feature"
    if [ "$optional" = "true" ] && [ ! -f "$FEATURE_PATH" ]; then
        log "ORCH" "Warning: Optional feature '$feature' not found -- skipping"
        continue
    fi

    log "ORCH" "Running: $feature $_args"
    if ! sh "$FEATURE_PATH" $_args; then
        die "Pipeline aborted: $feature failed"
    fi
done < "$PIPELINE_FILE"
