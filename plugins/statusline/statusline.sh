#!/bin/bash
# Status line, one line of capsules: model + effort bar [+ ultracode], then the
# repo pill (where the session works, branch, sync, changes, PR), the usage
# pill (5-hour and weekly windows), then claude-powerline's context pill.
# The plugin's hooks/register.ts makes Claude Code run it as the status line.
input=$(cat)
here=$(dirname "${BASH_SOURCE[0]}")

# powerline (context). model/directory/git/block/weekly are disabled in the
# claude-powerline.json beside this script because our own capsules carry them.
powerline=$(printf '%s' "$input" | npx -y @owloops/claude-powerline@latest --theme=gruvbox --style=capsule --config="$here/claude-powerline.json")

read -r model effort cwd wt_name transcript pr_num pr_url pr_review pr_kind < <(printf '%s' "$input" | jq -r '[
  (.model.display_name // .model.id // "Claude"),
  (.effort.level // "-"),
  (.workspace.current_dir // .cwd // "/"),
  (.worktree.name // "-"),
  (.transcript_path // "-"),
  (.pr.number // "-" | tostring),
  (.pr.url // "-"),
  (.pr.review_state // "-"),
  (.pr.kind // "-")
] | map(gsub(" "; " ")) | @tsv')
model=${model//$' '/ }
cwd=${cwd//$' '/ }
transcript=${transcript//$' '/ }

RESET=$'\e[0m'; DIM=$'\e[2m'; BOLD=$'\e[1m'
C_MODEL=$'\e[38;5;214m'; C_DIR=$'\e[38;5;109m'; C_WT=$'\e[38;5;142m'; C_SEP=$'\e[38;5;242m'

# Effort: low → max as a thin 5-segment bar, the reached segments coloured.
case "$effort" in
  low) n=1; C_EFF=$'\e[38;5;108m' ;;
  medium) n=2; C_EFF=$'\e[38;5;142m' ;;
  high) n=3; C_EFF=$'\e[38;5;214m' ;;
  xhigh) n=4; C_EFF=$'\e[38;5;208m' ;;
  max) n=5; C_EFF=$'\e[38;5;167m' ;;
  *) n=0; C_EFF="" ;;
esac
eff=""
if [ "$n" -gt 0 ]; then
  for i in 0 1 2 3 4; do
    if [ "$i" -lt "$n" ]; then eff+="${C_EFF}━"; else eff+="${DIM}${C_SEP}─${RESET}"; fi
  done
  eff+="${RESET}"
else
  eff="${DIM}effort ?${RESET}"
fi

# Ultracode: the status line JSON does not carry it, so read it from where
# Claude Code leaves it. The last /effort toggle of the session wins (its
# output lands in the transcript); otherwise --effort ultracode on the claude
# process, or the `ultracode` settings key (user < project < local).
ultra=""
marker="local-command-std""out>"
if [ -f "$transcript" ]; then
  last=$(grep -o "${marker}[^<]*Ultracode o[nf]" "$transcript" 2>/dev/null | tail -1)
  case "$last" in *"Ultracode on") ultra=1 ;; *"Ultracode of") ultra=0 ;; esac
fi
if [ -z "$ultra" ]; then
  ultra=0
  ps -o args= -p "$PPID" 2>/dev/null | grep -q -- '--effort[ =]ultracode' && ultra=1
  for f in "$HOME/.claude/settings.json" "$cwd/.claude/settings.json" "$cwd/.claude/settings.local.json"; do
    [ -f "$f" ] || continue
    v=$(jq -r 'if has("ultracode") then .ultracode else empty end' "$f" 2>/dev/null)
    [ "$v" = "true" ] && ultra=1
    [ "$v" = "false" ] && ultra=0
  done
fi
C_ULTRA=$'\e[38;5;175m'
ultra_tag=""
[ "$ultra" = 1 ] && ultra_tag=" ${C_ULTRA}${BOLD}✦ ultracode${RESET}"

# Repo pill: where the session works (⌂ main checkout, ↳ wt:<name> for a
# linked worktree, plain path outside git), branch, ahead/behind its upstream
# (last fetch), uncommitted changes, and the PR Claude Code reports.
C_BRANCH=$'\e[38;5;175m'; C_OK=$'\e[38;5;142m'; C_UP=$'\e[38;5;108m'; C_DOWN=$'\e[38;5;208m'
C_MOD=$'\e[38;5;214m'; C_BAD=$'\e[38;5;167m'
g() { git -C "$cwd" --no-optional-locks "$@" 2>/dev/null; }
if top=$(g rev-parse --show-toplevel) && [ -n "$top" ]; then
  gitdir=$(g rev-parse --absolute-git-dir)
  common=$(g rev-parse --path-format=absolute --git-common-dir)
  if [ "$gitdir" != "$common" ]; then
    loc="${C_DIR}$(basename "$(dirname "$common")") ${C_WT}${BOLD}↳ wt:$(basename "$top")${RESET}"
  else
    loc="${C_DIR}⌂ $(basename "$top")${RESET}"
  fi
  sub=${cwd#"$top"}
  [ -n "$sub" ] && [ "$sub" != "$cwd" ] && loc+="${DIM}${C_DIR}${sub}${RESET}"

  branch=$(g branch --show-current)
  [ -z "$branch" ] && branch="@$(g rev-parse --short HEAD)"
  repo="${loc}  ${C_BRANCH}⎇ ${branch}${RESET}"

  if counts=$(g rev-list --left-right --count 'HEAD...@{upstream}'); then
    read -r ahead behind <<<"$counts"
    [ "$ahead" -gt 0 ] && repo+=" ${C_UP}↑${ahead}${RESET}"
    [ "$behind" -gt 0 ] && repo+=" ${C_DOWN}↓${behind}${RESET}"
  else
    repo+=" ${DIM}${C_SEP}no upstream${RESET}"
  fi

  read -r staged modified untracked < <(g status --porcelain | awk '
    /^\?\?/ {u++; next} { if (substr($0,1,1) != " ") s++; if (substr($0,2,1) != " ") m++ }
    END {print s+0, m+0, u+0}')
  changes=""
  [ "$staged" -gt 0 ] && changes+=" ${C_OK}+${staged}${RESET}"
  [ "$modified" -gt 0 ] && changes+=" ${C_MOD}~${modified}${RESET}"
  [ "$untracked" -gt 0 ] && changes+=" ${DIM}${C_DIR}?${untracked}${RESET}"
  [ -z "$changes" ] && changes=" ${C_OK}✓${RESET}"
  repo+="$changes"
else
  repo="${C_DIR}${cwd/#$HOME/\~}${RESET}"
fi

# PR as an OSC 8 hyperlink, so the number opens it.
if [ "$pr_num" != "-" ]; then
  pr="PR #${pr_num}"
  [ "$pr_url" != "-" ] && pr=$'\e]8;;'"${pr_url}"$'\e\\'"${pr}"$'\e]8;;\e\\'
  case "$pr_review" in
    approved) pr+=" ${C_OK}✓${RESET}" ;;
    changes_requested) pr+=" ${C_BAD}✗${RESET}" ;;
  esac
  [ "$pr_kind" = "draft" ] && pr+=" ${DIM}draft${RESET}"
  repo+="  ${BOLD}${pr}${RESET}"
fi

# Usage pill: the 5-hour and weekly windows Claude Code reports, each with
# its used % (yellow from 50, red from 80) and the time left until it resets.
now=$(date +%s)
window() { # $1 = label, $2 = used %, $3 = resets_at (epoch s)
  local pct=${2%.*} c=$C_OK left mins
  [ "$pct" -ge 50 ] && c=$C_MOD
  [ "$pct" -ge 80 ] && c=$C_BAD
  left=""
  if [ "$3" != "-" ]; then
    mins=$(( ($3 - now) / 60 )); [ "$mins" -lt 0 ] && mins=0
    if [ "$mins" -ge 1440 ]; then left="$((mins / 1440))d$((mins % 1440 / 60))h"
    elif [ "$mins" -ge 60 ]; then left="$((mins / 60))h$((mins % 60))m"
    else left="${mins}m"; fi
    left=" ${DIM}${C_DIR}${left}${RESET}"
  fi
  printf '%s' "${DIM}${C_DIR}${1}${RESET} ${c}${pct}%${RESET}${left}"
}
read -r h5_pct h5_reset d7_pct d7_reset < <(printf '%s' "$input" | jq -r '[
  (.rate_limits.five_hour.used_percentage // "-" | tostring),
  (.rate_limits.five_hour.resets_at // "-" | tostring),
  (.rate_limits.seven_day.used_percentage // "-" | tostring),
  (.rate_limits.seven_day.resets_at // "-" | tostring)
] | @tsv')
usage=""
[ "$h5_pct" != "-" ] && usage+="$(window 5h "$h5_pct" "$h5_reset")"
[ "$d7_pct" != "-" ] && usage+="${usage:+  }$(window 7d "$d7_pct" "$d7_reset")"

# Capsule like powerline's: rounded caps in the pill colour around a filled body.
PILL_BG='80;73;69'; DIR_BG='60;56;54'; PILL_FG=$'\e[38;2;235;219;178m'
pill() { # $1 = bg rgb, $2 = body (may carry its own fg colours)
  local body=${2//$RESET/$RESET$'\e[48;2;'$1'm'}
  printf '%s%s%s %s %s%s%s' $'\e[38;2;'$1'm' $'\ue0b6' $'\e[48;2;'$1'm'"$PILL_FG" "$body" "$RESET" $'\e[38;2;'$1'm' $'\ue0b4'"$RESET"
}
printf '%s %s %s' \
  "$(pill "$PILL_BG" "${C_MODEL}${BOLD}${model}${RESET} ${eff}${ultra_tag}")" \
  "$(pill "$DIR_BG" "$repo")" \
  "${usage:+$(pill "$PILL_BG" "$usage") }$powerline"
