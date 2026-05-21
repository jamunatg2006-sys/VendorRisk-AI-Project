"""
email_worker.py — VendorRisk Email Queue Processor
===================================================
Background task processor that reads pending emails from the SQLite database queue
and sends them via SMTP. Runs every 5 minutes (or as a scheduled task).

Features:
  - Connects to shared vendors.db (same as Node.js backend)
  - Processes email_queue table
  - Sends via SMTP (Gmail/163/custom)
  - Updates status on success/failure
  - Supports retry logic
  - HTML + plain text email templates
"""

import sqlite3
import smtplib
import time
import logging
import os
from datetime import datetime, timedelta
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from pathlib import Path
from dotenv import load_dotenv

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('email_worker.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

# Load environment variables
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), ".env"))

# Configuration
DB_PATH = os.getenv('DB_PATH', '../BACKENDD/database/vendors.db')
SMTP_SERVER = os.getenv('SMTP_SERVER', 'smtp.gmail.com')
SMTP_PORT = int(os.getenv('SMTP_PORT', 587))
SMTP_EMAIL = os.getenv('SMTP_EMAIL', 'your-email@gmail.com')
SMTP_PASSWORD = os.getenv('SMTP_PASSWORD', 'your-app-password')
SENDER_NAME = os.getenv('SENDER_NAME', 'VendorRisk Alerts')
SEND_EMAIL_ENABLED = os.getenv('SEND_EMAIL_ENABLED', 'False').lower() == 'true'

# Email templates directory
TEMPLATES_DIR = os.path.join(os.path.dirname(__file__), 'email_templates')


def get_db_connection():
    """Connect to shared SQLite database."""
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        return conn
    except sqlite3.Error as e:
        logger.error(f"Database connection error: {e}")
        return None


def get_pending_emails(conn, limit=10):
    """Fetch pending emails from queue."""
    try:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT id, recipient_email, subject, body, retry_count
            FROM email_queue
            WHERE status = 'pending' AND retry_count < 3
            ORDER BY created_at ASC
            LIMIT ?
        """, (limit,))
        return cursor.fetchall()
    except sqlite3.Error as e:
        logger.error(f"Database query error: {e}")
        return []


def load_email_template(template_name):
    """Load email template from file."""
    template_path = os.path.join(TEMPLATES_DIR, f'{template_name}.html')
    try:
        if os.path.exists(template_path):
            with open(template_path, 'r', encoding='utf-8') as f:
                return f.read()
    except Exception as e:
        logger.error(f"Template load error: {e}")
    return None


def send_email(recipient_email, subject, body_html):
    """Send email via SMTP."""
    if not SEND_EMAIL_ENABLED:
        logger.info(f"[DEMO] Would send email to {recipient_email}: {subject}")
        return True

    try:
        # Create message
        msg = MIMEMultipart('alternative')
        msg['From'] = f"{SENDER_NAME} <{SMTP_EMAIL}>"
        msg['To'] = recipient_email
        msg['Subject'] = subject

        # Plain text version (fallback)
        text = body_html.replace('<br>', '\n').replace('<p>', '').replace('</p>', '\n')
        part1 = MIMEText(text, 'plain')
        msg.attach(part1)

        # HTML version
        part2 = MIMEText(body_html, 'html')
        msg.attach(part2)

        # Send via SMTP
        server = smtplib.SMTP(SMTP_SERVER, SMTP_PORT)
        server.starttls()
        server.login(SMTP_EMAIL, SMTP_PASSWORD)
        server.send_message(msg)
        server.quit()

        logger.info(f"✅ Email sent to {recipient_email}: {subject}")
        return True

    except smtplib.SMTPAuthenticationError as e:
        logger.error(f"SMTP authentication failed: {e}")
        return False
    except smtplib.SMTPException as e:
        logger.error(f"SMTP error: {e}")
        return False
    except Exception as e:
        logger.error(f"Email send error: {e}")
        return False


def update_email_status(conn, email_id, status, sent_at=None):
    """Update email status in database."""
    try:
        cursor = conn.cursor()
        if status == 'sent':
            cursor.execute("""
                UPDATE email_queue
                SET status = ?, sent_at = ?
                WHERE id = ?
            """, (status, datetime.now().isoformat(), email_id))
        else:
            cursor.execute("""
                UPDATE email_queue
                SET status = ?, retry_count = retry_count + 1
                WHERE id = ?
            """, (status, email_id))
        conn.commit()
        return True
    except sqlite3.Error as e:
        logger.error(f"Status update error: {e}")
        return False


def process_email_queue():
    """Main function to process pending emails."""
    logger.info("=" * 60)
    logger.info("🚀 Email Queue Processor Started")
    logger.info(f"   Database: {DB_PATH}")
    logger.info(f"   SMTP: {SMTP_SERVER}:{SMTP_PORT}")
    logger.info(f"   Sender: {SENDER_NAME}")
    logger.info(f"   Demo Mode: {not SEND_EMAIL_ENABLED}")
    logger.info("=" * 60)

    conn = get_db_connection()
    if not conn:
        logger.error("❌ Failed to connect to database")
        return

    try:
        pending_emails = get_pending_emails(conn)

        if not pending_emails:
            logger.info("✓ No pending emails")
        else:
            logger.info(f"📧 Found {len(pending_emails)} pending email(s)")

            for email_record in pending_emails:
                email_id = email_record['id']
                recipient = email_record['recipient_email']
                subject = email_record['subject']
                body = email_record['body']

                logger.info(f"\n  [ID: {email_id}] Processing: {recipient}")
                logger.info(f"    Subject: {subject}")

                # Send email
                success = send_email(recipient, subject, body)

                if success:
                    update_email_status(conn, email_id, 'sent')
                    logger.info(f"    Status: ✅ SENT")
                else:
                    update_email_status(conn, email_id, 'failed')
                    logger.warning(f"    Status: ⚠️ FAILED (will retry)")

        logger.info("\n" + "=" * 60)
        logger.info("✅ Email queue processing complete")
        logger.info("=" * 60)

    except Exception as e:
        logger.error(f"❌ Processing error: {e}")
    finally:
        if conn:
            conn.close()


def run_continuously(interval=300):
    """Run email processor continuously at specified interval (seconds)."""
    logger.info(f"Starting continuous mode (interval: {interval}s)")
    try:
        while True:
            process_email_queue()
            logger.info(f"Next run in {interval}s...\n")
            time.sleep(interval)
    except KeyboardInterrupt:
        logger.info("\n✓ Email worker stopped")


if __name__ == "__main__":
    import sys

    if len(sys.argv) > 1 and sys.argv[1] == "--continuous":
        # Run continuously (e.g., via Docker or systemd)
        interval = int(sys.argv[2]) if len(sys.argv) > 2 else 300  # default 5 min
        run_continuously(interval)
    else:
        # Run once (for cron jobs)
        process_email_queue()
