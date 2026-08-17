# VendorRisk AI

VendorRisk AI is a full-stack vendor risk assessment platform that helps organizations evaluate third-party vendors before onboarding them. It works like a security background check for vendors: a user enters a vendor name, the system analyzes cybersecurity, operational, financial, compliance, reputation, and dark web signals, then returns an understandable risk score and recommendation.

The project is built as a complete web application with authentication, dashboards, vendor analysis, comparison, monitoring, alerts, report generation, and deployment-ready backend services.

## Live Deployment

DEPLOYED URL:

```text
https://vendor-risk-ai.vercel.app
```

Node.js backend:

```text
https://vendorrisk-ai-backendd.onrender.com
```

Python risk engine:

```text
https://vendorrisk-ai-project-backend.onrender.com
```

<!-- Important note: The project has been deployed successfully, but login on the deployed link may not work at the moment because the free hosting limit/quota has been exhausted. The complete project can still be run locally using the steps at the end of this README. -->

## Problem Statement

Companies often onboard vendors without knowing their real security posture. This creates supply chain risk because one weak third-party vendor can become an entry point for attackers.

VendorRisk AI addresses this by helping teams answer questions like:

- Is this vendor safe to work with?
- How risky is this vendor compared with others?
- Are there known vulnerabilities connected to the vendor?
- Does the vendor show signs of compliance, reputation, financial, or dark web risk?
- Should the company approve, review, or reject the vendor?

## What The Platform Does

VendorRisk AI allows users to:

- Register and log in securely.
- Analyze vendors using a six-pillar risk engine.
- View a risk score, risk level, and detailed factor breakdown.
- Store analyzed vendors in a SQLite database.
- View all vendors in a dashboard.
- Compare vendors side by side.
- Monitor vendors for risk changes.
- Generate professional reports.
- Receive risk alerts for high-risk vendors.
- Manage profile and alert preferences.

## Core Idea

Instead of giving only a simple pass/fail result, VendorRisk AI gives a structured risk profile. It combines technical vulnerability intelligence with business risk signals so the user can make a better vendor onboarding decision.

Example:

```text
Vendor: microsoft.com
Risk Score: 77/100
Risk Level: High
Reason: Known vulnerabilities, cyber exposure, compliance signals, operational checks, reputation indicators, and other vendor risk factors.
Recommendation: Review security documents carefully before onboarding.
```

## Architecture

The project uses a dual-backend architecture:

```text
Frontend (HTML, CSS, JavaScript)
        |
        v
Node.js Backend (Port 5001)
Authentication, sessions, SQLite database, alerts, vendor history
        |
        v
Python Backend (Port 5000)
Six-pillar vendor risk analysis engine
```

## System Architecture

VendorRisk AI is divided into three major parts: frontend, Node.js backend, and Python risk engine.

```text
User
 |
 | 1. Opens website and logs in
 v
Frontend - HTML, CSS, JavaScript
 |
 | 2. Sends login, vendor analysis, dashboard, report, and monitor requests
 v
Node.js Backend - Express.js
 |
 | 3. Validates session, stores user/vendor data, and forwards analysis request
 v
Python Risk Engine - Flask
 |
 | 4. Fetches real/signal data from public sources and runs six-pillar analysis
 v
Risk Scoring Engine
 |
 | 5. Returns score, risk level, factor breakdown, alerts, and recommendations
 v
Frontend Dashboard / Report / Monitor Page
```

### Role Of Each Layer

| Layer | Responsibility |
| --- | --- |
| Frontend | Displays UI, collects vendor input, shows scanning animation, dashboard, comparison, reports, and alerts |
| Node.js backend | Handles registration, login, sessions, SQLite database, vendor history, alerts, and protected API routes |
| Python backend | Performs vendor risk analysis using cyber, operations, financial, reputation, compliance, and dark web modules |
| SQLite database | Stores users, sessions, vendors, vendor history, alerts, preferences, and logs |
| External data sources | Provide real vulnerability, breach, web, finance, and reputation signals |

## How The Analysis Works

The analysis happens in five clear steps.

### Step 1: User Enters Vendor Details

The user logs in and opens the analysis page. They enter a vendor name or domain, such as:

```text
microsoft.com
```

The frontend sends the request to the Node.js backend:

```text
POST /api/analyze
```

### Step 2: Node.js Validates And Forwards The Request

The Node.js backend checks whether the user is logged in using the session token. If the user is valid, Node.js forwards the vendor name to the Python risk engine.

Node.js also saves the final analysis result in SQLite after the Python engine returns the score.

### Step 3: Python Normalizes The Vendor

The Python backend converts the input into a clean vendor name and domain.

Example:

```text
Input: Microsoft
Normalized vendor: microsoft
Normalized domain: microsoft.com
```

This helps the system search external sources consistently.

### Step 4: Python Runs Six-Pillar Analysis

The Python backend runs six analysis modules in parallel:

| Pillar | What Happens |
| --- | --- |
| Cyber Security | Checks technologies, CVEs, vulnerability count, severity, and critical issues |
| Operations | Checks HTTPS, security.txt, response time, and basic operational signals |
| Financial | Checks market/business indicators where available |
| Reputation | Checks news/sentiment signals using NewsAPI and VADER where configured |
| Compliance | Searches for compliance and certification indicators |
| Dark Web | Checks public breach exposure signals using HIBP public breach data |

Running these modules in parallel makes the analysis faster because the system does not wait for one pillar to finish before starting the next.

### Step 5: Score Is Calculated And Shown

The Python scoring engine combines all pillar results into a final score and risk level.

```text
Final Output:
Risk Score: 0-100
Risk Level: Low / Medium / High / Critical
Factor Breakdown: Cyber, Operations, Financial, Reputation, Compliance, Dark Web
Recommendation: Review, monitor, approve, or avoid depending on the score
```

The result goes back to Node.js, where it is saved in the database. Then the frontend displays it in the analysis page, dashboard, comparison page, monitor page, and report page.

## Real Data Sources Used

VendorRisk AI uses a mix of real public data sources and calculated signals.

| Source | Type | Used For |
| --- | --- | --- |
| NVD/NIST CVE API | Real public vulnerability data | CVE count, severity, critical vulnerabilities, vendor cyber exposure |
| OSV.dev | Real open-source vulnerability data | Additional vulnerability intelligence |
| Have I Been Pwned public breaches endpoint | Real public breach dataset | Dark web/breach exposure signal |
| yfinance | Real market/financial data where available | Financial and company stability indicators |
| NewsAPI | Real news headlines, optional API key | Reputation analysis and sentiment signals |
| VADER Sentiment | Local sentiment analysis library | Converts news text into positive/negative reputation signal |
| Vendor website checks | Live web checks | HTTPS, security.txt, compliance keywords, operational indicators |

Some signals depend on API availability, quota, and whether the vendor has enough public data. If an API key is missing or a public service rate-limits requests, the system handles it gracefully and continues analysis with available signals.

## What Is Stored In The Database?

The SQLite database stores the application state so the platform behaves like a real product, not just a one-time scanner.

| Table/Area | Data Stored |
| --- | --- |
| Users | Username, email, hashed password, login details |
| Sessions | Session tokens and expiry time |
| Vendors | Vendor name, industry, risk score, risk level, vulnerabilities, factor breakdown |
| Vendor history | Previous scores for tracking changes over time |
| Alerts | High-risk and critical-risk notifications |
| Preferences | User notification and alert settings |
| Logs | Backend events and error records |

## Why Two Backends?

The application uses both Node.js and Python because each is strong in a different area.

| Layer | Purpose |
| --- | --- |
| Frontend | User interface, forms, dashboard, reports, comparison, monitoring |
| Node.js backend | Authentication, session tokens, SQLite database, user data, alerts, API gateway |
| Python backend | Vendor risk analysis, data collection, scoring, dark web/reputation/compliance checks |

This makes the system more realistic and modular: Node.js manages the web application workflow, while Python handles deeper risk analysis logic.

## Tech Stack

| Area | Technology |
| --- | --- |
| Frontend | HTML, CSS, JavaScript |
| Backend API | Node.js, Express.js |
| Risk Engine | Python, Flask |
| Database | SQLite |
| Authentication | bcrypt password hashing, session tokens |
| Deployment | Vercel for frontend, Render for backends |
| Reports | Browser-based report/PDF generation |
| External data | NVD/NIST CVE data, OSV.dev, HIBP public breach data, NewsAPI support |

## Main Features

### 1. Vendor Analysis

Users enter a vendor name or domain and choose an industry. The platform runs an analysis and displays a risk score, risk level, score breakdown, and recommendation.

### 2. Six-Pillar Risk Engine

The Python backend analyzes vendors across six pillars:

| Pillar | What It Checks |
| --- | --- |
| Cyber Security | Vulnerabilities, CVEs, technology exposure, severity |
| Operations | HTTPS, security.txt, latency, availability-related signals |
| Financial | Market and business signals where available |
| Reputation | News and sentiment signals |
| Compliance | Compliance-related keywords and certification signals |
| Dark Web | Public breach exposure indicators |

### 3. Dashboard

The dashboard shows all analyzed vendors, total vendors, risk categories, and stored results. Users can review and delete vendor records.

### 4. Vendor Comparison

The comparison page lets users compare vendors side by side and understand which vendor has lower risk.

### 5. Continuous Monitoring

The monitoring module checks stored vendors again and identifies risk changes such as new vulnerabilities or increased severity.

### 6. Alerts

High-risk and critical-risk vendors can generate alerts. Alerts are stored and can also be connected to email-style notification workflows.

### 7. Reports

The report page generates professional vendor risk reports that can be used for presentations, reviews, or project submission.

### 8. Authentication

The Node.js backend supports:

- User registration
- User login
- Session token management
- Password hashing with bcrypt
- Profile updates
- Password change flow
- User preferences

## Pages Included

| Page | Purpose |
| --- | --- |
| `index.html` | Landing/home page |
| `about.html` | Project and platform information |
| `login.html` | User login |
| `register.html` | New user registration |
| `forgot-password.html` | Password reset request |
| `reset-password.html` | Password reset page |
| `analyze.html` | Main vendor analysis screen |
| `dashboard.html` | Vendor inventory and stats |
| `Vendor-comparison.html` | Vendor comparison |
| `monitor.html` | Continuous monitoring and alerts |
| `report.html` | Report generation |
| `profile.html` | Profile and preferences |
| `deepSearch.html` | Extended analysis/search experience |

## Risk Scoring Summary

VendorRisk AI produces a score from 0 to 100 and maps it to an understandable risk level.

```text
0 - 39   Low Risk
40 - 69  Medium Risk
70 - 100 High/Critical Risk
```

The final score is based on multiple risk pillars rather than one single metric. This makes the result more useful because vendor risk is not only a cybersecurity problem; it also includes operational, compliance, reputation, financial, and breach exposure signals.

## Project Structure

```text
VendorRisk/
  FrontEnd/
    index.html
    login.html
    register.html
    analyze.html
    dashboard.html
    monitor.html
    report.html
    style.css
    responsive.css
    nav.js
    assets/

  BACKENDD/
    server.js
    package.json
    database/
      vendors.db

  Python_BackEnd/
    app.py
    requirements.txt
    logic/
      cyber_engine.py
      operations.py
      financial.py
      reputation.py
      compliance.py
      darkweb_e.py
      scoring_engine.py

  render.yaml
  DEPLOYMENT_CHECKLIST.md
```

## API Overview

### Node.js Backend

Runs by default on:

```text
http://localhost:5001
```

Important endpoints:

| Endpoint | Purpose |
| --- | --- |
| `GET /health` | Node backend health check |
| `POST /auth/register` | Create account |
| `POST /auth/login` | Login |
| `POST /auth/logout` | Logout |
| `GET /auth/me` | Current user |
| `POST /api/analyze` | Analyze vendor |
| `GET /api/vendors` | Fetch user vendors |
| `DELETE /api/vendors/:id` | Delete vendor |
| `GET /api/stats` | Dashboard stats |
| `POST /api/monitor/check` | Re-check vendor |
| `GET /api/alerts` | Fetch alerts |

### Python Backend

Runs by default on:

```text
http://localhost:5000
```

Important endpoints:

| Endpoint | Purpose |
| --- | --- |
| `GET /health` | Python risk engine health check |
| `GET /analyze?vendor=<vendor>` | Run six-pillar vendor analysis |

## Environment Variables

### Node.js Backend

Create a `.env` file inside `BACKENDD` if needed:

```env
PORT=5001
PYTHON_API_BASE=http://localhost:5000
FRONTEND_URL=http://localhost:8000
SQLITE_DB_DIR=./database
ANALYSIS_TIMEOUT_MS=120000
```

### Python Backend

Create a `.env` file inside `Python_BackEnd` if needed:

```env
PORT=5000
ALERT_API_URL=http://localhost:5001/api/alerts/internal
THE_NEWSAPI_KEY=your_newsapi_key_here
```

`THE_NEWSAPI_KEY` is optional. If it is missing or quota-limited, the reputation module uses fallback behavior.

## Deployment Notes

The project is configured for:

- Vercel frontend deployment from `FrontEnd`
- Render Node.js service from `BACKENDD`
- Render Python service from `Python_BackEnd`

Render free-tier services may sleep or stop responding when limits are reached. That is why the deployed app may open but login or analysis may fail until the backend services are active again or moved to a paid/available hosting plan.

## What Makes This Project Strong

- Complete full-stack implementation, not just static pages.
- Real authentication and user session flow.
- Dual-backend design using Node.js and Python.
- SQLite persistence for vendors, users, sessions, alerts, and history.
- Six-pillar risk analysis engine.
- Vendor comparison, monitoring, and report generation.
- Deployment-ready configuration for Vercel and Render.
- Practical cybersecurity use case connected to supply chain risk.

## Future Scope

- Add more real-time third-party intelligence APIs.
- Add organization/team accounts.
- Add admin dashboard and role-based access.
- Improve machine-learning based scoring.
- Add scheduled background vendor monitoring.
- Add email delivery service integration.
- Add enterprise SSO support.
- Replace SQLite with PostgreSQL for production scale.

## How To Run Locally

Open three terminals from the `VendorRisk` folder.

### Terminal 1: Start Python Risk Engine

```powershell
cd Python_BackEnd
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python app.py
```

Python backend will run on:

```text
http://localhost:5000
```

### Terminal 2: Start Node.js Backend

Before starting Node.js locally, create `BACKENDD/.env`:

```env
PYTHON_API_BASE=http://localhost:5000
FRONTEND_URL=http://localhost:8000
```

Then run:

```powershell
cd BACKENDD
npm install
npm start
```

Node backend will run on:

```text
http://localhost:5001
```

### Terminal 3: Start Frontend

```powershell
cd FrontEnd
python -m http.server 8000
```

Open in browser:

```text
http://localhost:8000
```

Note: The frontend files currently point to the deployed Render backend:

```text
https://vendorrisk-ai-backendd.onrender.com
```

To test fully local login and analysis, replace `API_BASE` in the frontend HTML files with:

```text
http://localhost:5001
```

Then register a new account, log in, and start analyzing vendors from `analyze.html`.
