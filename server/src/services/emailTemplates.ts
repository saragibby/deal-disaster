/**
 * Base HTML email template for all emails
 * Provides consistent branding and styling across all communications
 */

interface EmailTemplateOptions {
  title: string;
  preheader?: string;
  heroText: string;
  bodyHtml: string;
  footerText?: string;
}

export function createEmailTemplate({
  title,
  preheader,
  heroText,
  bodyHtml,
  footerText
}: EmailTemplateOptions): string {
  return `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta name="x-apple-disable-message-reformatting">
        <title>${title}</title>
        ${preheader ? `<meta name="description" content="${preheader}">` : ''}
        <style>
          /* Reset styles */
          body {
            margin: 0;
            padding: 0;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif;
            -webkit-font-smoothing: antialiased;
            -moz-osx-font-smoothing: grayscale;
            line-height: 1.6;
            color: #1e293b;
            background-color: #f8fafc;
          }
          
          table {
            border-collapse: collapse;
            width: 100%;
          }
          
          img {
            border: 0;
            line-height: 100%;
            text-decoration: none;
          }
          
          /* Container */
          .email-container {
            max-width: 600px;
            margin: 0 auto;
            background-color: #667eea;
            border-radius: 20px;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
            overflow: hidden;
            border: 3px solid #667eea;
          }
          
          /* Header */
          .email-header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: #ffffff;
            padding: 35px 40px;
            text-align: center;
          }
          
          .email-logo {
            width: 100%;
            max-width: 200px;
            height: auto;
            margin: 0 auto 20px;
            display: block;
          }
          
          .email-header h1 {
            margin: 0;
            font-size: 28px;
            font-weight: 800;
            line-height: 1.2;
          }
          
          /* Body */
          .email-body {
            background-color: #ffffff;
            padding: 35px 40px;
          }
          
          .email-body p {
            margin: 0 0 16px 0;
            font-size: 16px;
            line-height: 1.6;
            color: #1e293b;
          }
          
          /* Button */
          .email-button {
            display: inline-block;
            padding: 16px 40px;
            background: #2563eb;
            color: #ffffff !important;
            text-decoration: none;
            border-radius: 8px;
            font-weight: 700;
            font-size: 16px;
            text-align: center;
            margin: 24px 0;
            transition: opacity 0.2s;
          }
          
          .email-button:hover {
            opacity: 0.9;
          }
          
          /* Warning box */
          .warning-box {
            background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
            border-left: 4px solid #f59e0b;
            padding: 15px;
            margin: 20px 0;
            border-radius: 10px;
          }
          
          .warning-box strong {
            color: #92400e;
            font-weight: 700;
          }
          
          .warning-box p {
            color: #92400e;
            margin: 0;
          }
          
          /* Info box */
          .info-box {
            background: #e7f3ff;
            border-left: 4px solid #2563eb;
            padding: 15px;
            margin: 20px 0;
            border-radius: 10px;
          }
          
          .info-box p {
            color: #1e293b;
            margin: 0;
          }
          
          /* Footer */
          .email-footer {
            background-color: #f8fafc;
            padding: 30px 40px;
            text-align: center;
            color: #64748b;
            font-size: 14px;
          }
          
          .email-footer p {
            margin: 8px 0;
          }
          
          .email-footer a {
            color: #2563eb;
            text-decoration: none;
            font-weight: 600;
          }
          
          .email-footer a:hover {
            text-decoration: underline;
          }
          
          /* Utility classes */
          .text-center {
            text-align: center;
          }
          
          .text-muted {
            color: #64748b;
            font-size: 14px;
          }
          
          .link-primary {
            color: #2563eb;
            word-break: break-all;
          }
          
          /* Responsive */
          @media only screen and (max-width: 600px) {
            .email-container {
              width: 100% !important;
            }
            
            .email-header,
            .email-body,
            .email-footer {
              padding: 20px !important;
            }
            
            .email-header h1 {
              font-size: 24px !important;
            }
            
            .email-button {
              display: block !important;
              width: 100% !important;
              box-sizing: border-box;
            }
          }
        </style>
      </head>
      <body>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
          <tr>
            <td align="center" style="padding: 20px 0;">
              <table class="email-container" role="presentation" cellspacing="0" cellpadding="0" border="0">
                <!-- Header -->
                <tr>
                  <td class="email-header">
                    <img src="https://deal-or-disaster-e49d81876c17.herokuapp.com/assets/logo-CadPa1ty.png" alt="Deal or Disaster Logo" class="email-logo" />
                    <h1>${heroText}</h1>
                  </td>
                </tr>
                
                <!-- Body -->
                <tr>
                  <td class="email-body">
                    ${bodyHtml}
                  </td>
                </tr>
                
                <!-- Footer -->
                <tr>
                  <td class="email-footer">
                    ${footerText || `
                      <p>&copy; ${new Date().getFullYear()} Deal or Disaster by Money Man Myers</p>
                      <p>
                        <a href="${process.env.CLIENT_URL || 'https://dealdisaster.com'}">Visit our website</a> •
                        <a href="mailto:${process.env.SMTP_REPLY_TO || 'support@moneymanmyers.com'}">Contact Support</a>
                      </p>
                      <p class="text-muted">You're receiving this email because you signed up for Deal or Disaster.</p>
                    `}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;
}

/**
 * Create plain text version of email
 */
export function createPlainTextEmail(content: string): string {
  return content
    .replace(/<[^>]*>/g, '') // Remove HTML tags
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
}
