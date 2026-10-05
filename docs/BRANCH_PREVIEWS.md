# Branch previews

`main` is the live Canvas assignment at the site root. Work on any other branch can be seen at its own URL without touching `main`.

| What | Where |
|---|---|
| Live site (`main`) | `https://adamborecki.github.io/mixer-lab/` |
| A preview | `https://adamborecki.github.io/mixer-lab/branch/<slug>/` |
| List of previews | `https://adamborecki.github.io/mixer-lab/branch/` |
| Assignment 1, frozen for late work (`legacy`) | `https://adamborecki.github.io/mixer-lab/legacy/` |

The `legacy` branch is the site as it was when Assignment 1 (the ten scenarios) was due. It isn't a preview: no preview banner, and it shares the live site's saved progress (its own banner says what it is). Its progress code keeps entries it doesn't know, so using it never erases work done in the current version. A push to `legacy` rebuilds the site.

The slug is the branch name in lower case with every run of other characters turned into `-`. For example, `skin/yamaha-stagepas` becomes `skin-yamaha-stagepas`.

## Which branches get one

Branches starting with `claude/`, `skin/`, `feature/` or `preview/`. Cloud and phone sessions create `claude/...` branches, so their work shows up without any renaming. Other branches stay unpublished.

At most 15 previews are published, newest commit first, because each one carries its own copy of `audio/` and Pages sites are capped at 1 GB. Delete merged or abandoned branches and their previews disappear on the next deploy.

## How it works

- `.github/workflows/preview-trigger.yml`: a push to a preview branch asks `pages.yml` to run on `main`. It deploys nothing itself.
- `.github/workflows/pages.yml`: runs on `main` for a push to `main`, a branch deletion, or a request from the trigger. `tools/build-pages.sh` builds the whole site (main at the root, every preview branch under `branch/`), then the workflow deploys it.
- Only `main` can deploy. The `github-pages` environment's branch policy allows `main` alone, so an experimental branch (or a collaborator's) can't change what gets published or how.

A preview has a short delay: the trigger run, then the full deploy, about 1–2 minutes after a push.

To change the prefixes, edit both `PREVIEW_PREFIXES` in `tools/build-pages.sh` and the branch list in `preview-trigger.yml`.

## How the app behaves in a preview

`js/deploy-context.js` reads `branch/<slug>/` from the page's path.

- A yellow banner names the branch and links to the live site, and the tab title starts with `[preview]`.
- Saved data (progress, chosen skin) is stored under its own key per preview (`mixer-lab-progress-v1@<slug>`), so trying a preview never changes a student's real progress.
- A Canvas submission made in a preview carries the preview URL, which the check code covers. `tools/verify-submission.mjs` prints a warning for it.
- Previews are marked `noindex`.

## Testing the build locally

```bash
ROOT_REF=HEAD REF_NS=refs/heads tools/build-pages.sh /tmp/site
```

That builds from local branches instead of `origin`. Serve `/tmp/site` and open `/branch/<slug>/`.
