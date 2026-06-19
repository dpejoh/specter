# shellcheck shell=sh
STD_ALPHABET="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
SHUFFLED_ALPHABET="1dgWnocayqxU3r6vA5lCIPYfHmkV08b4tz+KMsp2NQ9LRXihODwSj7BEFJ/ZuGTe"

decode_substitution() {
  _ds_in="$1" _ds_out="$2"
  tr "$SHUFFLED_ALPHABET" "$STD_ALPHABET" < "$_ds_in" > "$_ds_out"
  unset _ds_in _ds_out
}
