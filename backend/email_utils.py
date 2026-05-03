import random
import string
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import os

SMTP_EMAIL = os.getenv("SMTP_EMAIL")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD")
SMTP_HOST = os.getenv("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))

def generate_otp(length=6):
    """Generate a random numeric OTP."""
    return ''.join(random.choices(string.digits, k=length))

def send_otp_email(to_email: str, otp_code: str) -> bool:
    """Send OTP via SMTP. Falls back to console print if SMTP is not configured."""
    if not SMTP_EMAIL or not SMTP_PASSWORD:
        print(f"\n{'='*50}")
        print(f"  OTP for {to_email}: {otp_code}")
        print(f"  (Configure SMTP_EMAIL and SMTP_PASSWORD env vars for real email)")
        print(f"{'='*50}\n")
        return True

    try:
        msg = MIMEMultipart()
        msg['From'] = SMTP_EMAIL
        msg['To'] = to_email
        msg['Subject'] = 'Smart Attendance - Password Reset OTP'

        body = f"""
        <html>
        <body style="font-family: Arial, sans-serif; padding: 20px;">
            <h2 style="color: #4F46E5;">Smart Attendance System</h2>
            <p>Your password reset OTP is:</p>
            <h1 style="color: #4F46E5; letter-spacing: 8px; font-size: 36px;">{otp_code}</h1>
            <p>This code expires in <b>5 minutes</b>.</p>
            <p style="color: #666;">If you didn't request this, please ignore this email.</p>
        </body>
        </html>
        """
        msg.attach(MIMEText(body, 'html'))

        server = smtplib.SMTP(SMTP_HOST, SMTP_PORT)
        server.starttls()
        server.login(SMTP_EMAIL, SMTP_PASSWORD)
        server.send_message(msg)
        server.quit()
        return True
    except Exception as e:
        logger.error(f"FATAL: SMTP Error while sending to {to_email}. Error: {str(e)}")
        print(f"Failed to send email: {e}")
        # Fallback: print to console
        print(f"\n  OTP for {to_email}: {otp_code}\n")
        return True
