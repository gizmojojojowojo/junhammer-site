"""Pull Google Search Console data for junhammer.com into CSVs (free, uses the GSC API).

Setup once:  pip3 install google-auth google-auth-oauthlib requests
             Put your OAuth desktop client file here as client_secret.json (never commit it).
Run:         python3 scripts/gsc/gsc_pull.py
Outputs:     pages.csv, queries.csv, page_queries.csv in this folder (git-ignored).
"""
import csv, datetime as dt, os, sys
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request, AuthorizedSession

HERE = os.path.dirname(os.path.abspath(__file__))
SECRET = os.path.join(HERE, "client_secret.json")
TOKEN = os.path.join(HERE, "token.json")
SCOPES = ["https://www.googleapis.com/auth/webmasters.readonly"]
SITE = os.environ.get("GSC_SITE", "sc-domain:junhammer.com")  # or "https://junhammer.com/"
END = dt.date.today() - dt.timedelta(days=3)
START = END - dt.timedelta(days=16 * 30)  # about 16 months, the GSC maximum

creds = Credentials.from_authorized_user_file(TOKEN, SCOPES) if os.path.exists(TOKEN) else None
if creds and creds.expired and creds.refresh_token:
    creds.refresh(Request())
if not creds or not creds.valid:
    if not os.path.exists(SECRET):
        sys.exit(f"Missing {SECRET}.")
    creds = InstalledAppFlow.from_client_secrets_file(SECRET, SCOPES).run_local_server(port=0)
    open(TOKEN, "w").write(creds.to_json())
s = AuthorizedSession(creds)
url = f"https://searchconsole.googleapis.com/webmasters/v3/sites/{SITE.replace(':', '%3A').replace('/', '%2F')}/searchAnalytics/query"

def pull(dims, fname):
    rows, start_row = [], 0
    while True:
        r = s.post(url, json={"startDate": str(START), "endDate": str(END),
                              "dimensions": dims, "rowLimit": 25000, "startRow": start_row})
        if r.status_code != 200:
            sys.exit(f"{r.status_code}: {r.text[:400]}")
        batch = r.json().get("rows", [])
        rows += batch
        if len(batch) < 25000:
            break
        start_row += 25000
    with open(os.path.join(HERE, fname), "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(dims + ["clicks", "impressions", "ctr", "position"])
        for x in rows:
            w.writerow(x["keys"] + [x["clicks"], x["impressions"], round(x["ctr"], 4), round(x["position"], 1)])
    print(f"{fname}: {len(rows)} rows")

pull(["page"], "pages.csv")
pull(["query"], "queries.csv")
pull(["page", "query"], "page_queries.csv")
print(f"Done ({START} to {END}).")
