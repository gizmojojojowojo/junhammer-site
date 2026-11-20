# Instructions for Claude

## Commit authorship (so commits count on the owner's GitHub graph)

Every commit in this repository is authored by the owner, with Claude as co-author:

- Before committing, set the author for this clone:
  `git config user.name "gizmojojojowojo"` and
  `git config user.email "84601084+gizmojojojowojo@users.noreply.github.com"`.
- Never pass `-c user.name=Claude`, `--author="Claude ..."` or any other override that makes Claude the author.
- End each commit message with a `Co-Authored-By: Claude ...` trailer (and any other attribution lines the session asks for).
- Before pushing, check with `git log -1 --format='%an <%ae>'` that the author is the owner.

## Working in this repo

- Changes go on a branch and into a pull request. Do not push to `main` unless the owner asks for it.
- Run `npm test` and `npm run build` before opening a pull request.
- `public/_redirects` is generated. Add redirects to `data/url_inventory.csv` or to `EXTRA` in `scripts/build_redirects.py`, then run `python3 scripts/build_redirects.py`.
- The site's Content-Security-Policy (`public/_headers`) only allows scripts from this site. Bundle third-party scripts locally (see `public/unicorn-zombie-game/three.min.js`) instead of loading them from a CDN.
- Do not use em dashes in site content.
