using System.Globalization;
using System.Net;
using System.Text;
using Penancia.S.Domain.Report;

namespace Penancia.S.Domain.Report;

/// <summary>
/// Generates standard, print-safe A4 HTML for Chromium / Gotenberg rendering to PDF/A.
/// 
/// Key Layout Standards:
/// 1. Table layout for Sections B to I with columns: Parameter | Result | Unit | WHO 2021 Reference | Flag | Source.
/// 2. Clear status banners ("DRAFT: Not validated for clinical use" and "DRAFT: Awaiting sign-off").
/// 3. High-contrast, black-and-white print accessible badges (no color-only reliance).
/// 4. Section J narrative, limitations statement, electronic signature block, and audit verification ID.
/// </summary>
public static class ReportHtmlTemplate
{
    public static string RenderToHtml(SemenAnalysisReport report)
    {
        ArgumentNullException.ThrowIfNull(report);
        var sb = new StringBuilder();

        // Every interpolated value is HTML-encoded (WebUtility.HtmlEncode) so
        // report data can never inject markup into the clinical PDF.
        string sampleId = WebUtility.HtmlEncode(report.Header.SampleId);
        string verificationId = WebUtility.HtmlEncode(report.Header.VerificationId);

        sb.AppendLine("<!DOCTYPE html>");
        // data-verification is set on the document element so the @bottom-left
        // margin rule (content: 'Audit Verification: ' attr(data-verification))
        // has an element to read it from; previously no element set it, so the
        // audit ID never rendered in the margin.
        sb.AppendLine($"<html lang=\"en\" data-verification=\"{verificationId}\">");
        sb.AppendLine("<head>");
        sb.AppendLine("<meta charset=\"UTF-8\">");
        sb.AppendLine("<title>Semen Analysis Report - " + sampleId + "</title>");
        sb.AppendLine("<style>");
        sb.AppendLine(@"
            @page {
                size: A4;
                margin: 15mm 15mm 20mm 15mm;
                @bottom-right {
                    content: 'Page ' counter(page) ' of ' counter(pages);
                    font-size: 8pt;
                    font-family: Arial, sans-serif;
                }
                @bottom-left {
                    content: 'Audit Verification: ' attr(data-verification);
                    font-size: 8pt;
                    font-family: monospace;
                }
            }
            body {
                font-family: 'Helvetica Neue', Arial, sans-serif;
                font-size: 9pt;
                color: #111;
                line-height: 1.35;
                margin: 0;
                padding: 0;
            }
            .banner {
                background: #f8d7da;
                color: #721c24;
                border: 1px solid #f5c6cb;
                padding: 6px 12px;
                text-align: center;
                font-weight: bold;
                font-size: 10pt;
                letter-spacing: 0.5px;
                margin-bottom: 12px;
            }
            .header-table {
                width: 100%;
                border-collapse: collapse;
                margin-bottom: 15px;
                border-bottom: 2px solid #333;
                padding-bottom: 8px;
            }
            .section-title {
                font-size: 11pt;
                font-weight: bold;
                border-bottom: 1px solid #666;
                margin-top: 14px;
                margin-bottom: 6px;
                padding-bottom: 2px;
                text-transform: uppercase;
                letter-spacing: 0.3px;
            }
            .data-table {
                width: 100%;
                border-collapse: collapse;
                margin-bottom: 12px;
            }
            .data-table th, .data-table td {
                border: 1px solid #ccc;
                padding: 4px 6px;
                text-align: left;
            }
            .data-table th {
                background-color: #f2f2f2;
                font-weight: bold;
                font-size: 8.5pt;
            }
            .flag-badge {
                font-weight: bold;
                padding: 1px 4px;
                border: 1px solid #333;
                border-radius: 2px;
                display: inline-block;
                font-size: 8pt;
            }
            .flag-below {
                background-color: #333;
                color: #fff;
            }
            .narrative-box {
                background-color: #fafafa;
                border: 1px solid #ccc;
                padding: 8px 12px;
                margin-top: 8px;
                font-size: 8.5pt;
            }
            .signoff-box {
                margin-top: 20px;
                border-top: 1px solid #333;
                padding-top: 8px;
            }
        ");
        sb.AppendLine("</style>");
        sb.AppendLine("</head>");
        sb.AppendLine("<body>");

        // Status Control Banners
        if (!report.IsValidatedClinicalUse)
        {
            sb.AppendLine("<div class=\"banner\">DRAFT: Not validated for clinical use</div>");
        }
        else if (!report.IsSigned)
        {
            sb.AppendLine("<div class=\"banner\">DRAFT: Awaiting clinical sign-off</div>");
        }

        // Header Block
        sb.AppendLine("<table class=\"header-table\">");
        sb.AppendLine("<tr>");
        sb.AppendLine("<td><h2>PENANCIA.S CLINICAL LABORATORY</h2><p>Andrology & Semen Analysis Department</p></td>");
        sb.AppendLine("<td style=\"text-align: right;\">");
        sb.AppendLine($"<p><strong>Sample ID:</strong> {sampleId}</p>");
        sb.AppendLine($"<p><strong>Collection:</strong> {report.Header.CollectionDateTimeUtc.ToString("yyyy-MM-dd HH:mm", CultureInfo.InvariantCulture)} UTC</p>");
        sb.AppendLine($"<p><strong>Abstinence:</strong> {report.Header.AbstinenceDays.ToString(CultureInfo.InvariantCulture)} days</p>");
        sb.AppendLine("</td>");
        sb.AppendLine("</tr>");
        sb.AppendLine("</table>");

        // Parameters Table
        sb.AppendLine("<div class=\"section-title\">Laboratory Examination Parameters (WHO 2021 Reference)</div>");
        sb.AppendLine("<table class=\"data-table\">");
        sb.AppendLine("<thead>");
        sb.AppendLine("<tr>");
        sb.AppendLine("<th>Parameter</th>");
        sb.AppendLine("<th>Observed Result</th>");
        sb.AppendLine("<th>Unit</th>");
        sb.AppendLine("<th>WHO 2021 Reference</th>");
        sb.AppendLine("<th>Status / Flag</th>");
        sb.AppendLine("<th>Origin / Source</th>");
        sb.AppendLine("</tr>");
        sb.AppendLine("</thead>");
        sb.AppendLine("<tbody>");

        foreach (var item in report.Items)
        {
            string val = item.NumericValue.HasValue
                ? item.NumericValue.Value.ToString("F2", CultureInfo.InvariantCulture)
                : WebUtility.HtmlEncode(item.TextValue ?? "—");
            string flagHtml = item.Flag switch
            {
                "Below Reference" => "<span class=\"flag-badge flag-below\">BELOW REF</span>",
                "Abnormal" => "<span class=\"flag-badge flag-below\">ABNORMAL</span>",
                "Incomplete" => "<span class=\"flag-badge\">INCOMPLETE</span>",
                _ => "Normal"
            };

            sb.AppendLine("<tr>");
            sb.AppendLine($"<td><strong>{WebUtility.HtmlEncode(item.Parameter)}</strong></td>");
            sb.AppendLine($"<td>{val}</td>");
            sb.AppendLine($"<td>{WebUtility.HtmlEncode(item.Unit)}</td>");
            sb.AppendLine($"<td>{WebUtility.HtmlEncode(item.WhoReference)}</td>");
            sb.AppendLine($"<td>{flagHtml}</td>");
            sb.AppendLine($"<td><small>{WebUtility.HtmlEncode(item.Source.ToString())}</small></td>");
            sb.AppendLine("</tr>");
        }

        sb.AppendLine("</tbody>");
        sb.AppendLine("</table>");

        // Section J: Narrative & Sign-off
        sb.AppendLine("<div class=\"section-title\">Section J: Narrative & Clinical Summary</div>");
        sb.AppendLine("<div class=\"narrative-box\">");
        sb.AppendLine($"<p>{WebUtility.HtmlEncode(report.Footer.NarrativeText)}</p>");
        sb.AppendLine($"<p><small><em>{WebUtility.HtmlEncode(report.Footer.Limitations)}</em></small></p>");
        sb.AppendLine("</div>");

        // Electronic Signature Block
        sb.AppendLine("<div class=\"signoff-box\">");
        if (report.IsSigned)
        {
            sb.AppendLine($"<p><strong>Signed electronically by:</strong> {WebUtility.HtmlEncode(report.Footer.SignerName)}, {WebUtility.HtmlEncode(report.Footer.SignerRole)}</p>");
            sb.AppendLine($"<p><strong>Timestamp:</strong> {report.Footer.SignedAtUtc?.ToString("yyyy-MM-dd HH:mm:ss", CultureInfo.InvariantCulture)} UTC</p>");
            sb.AppendLine($"<p><strong>Verification Hash:</strong> <code>{verificationId}</code></p>");
        }
        else
        {
            sb.AppendLine("<p><em>[PENDING ELECTRONIC SIGNATURE - REPORT NOT RELEASED]</em></p>");
        }
        sb.AppendLine("</div>");

        sb.AppendLine("</body>");
        sb.AppendLine("</html>");

        return sb.ToString();
    }
}
