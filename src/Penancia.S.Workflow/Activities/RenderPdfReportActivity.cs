using System.Net;
using System.Security.Cryptography;
using System.Text;
using Azure.Storage.Blobs;
using Azure.Storage.Blobs.Models;
using Microsoft.Azure.Functions.Worker;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Penancia.S.Data;

namespace Penancia.S.Workflow.Activities;

/// <summary>
/// Renders the clinical report PDF and records the DraftReportPdfUri, version, and content hash.
/// </summary>
public class RenderPdfReportActivity
{
    private readonly PenanciaDbContext _db;
    private readonly ILogger<RenderPdfReportActivity> _logger;

    private readonly BlobServiceClient _blobs;
    private readonly IHttpClientFactory _httpClients;

    public RenderPdfReportActivity(
        PenanciaDbContext db,
        BlobServiceClient blobs,
        IHttpClientFactory httpClients,
        ILogger<RenderPdfReportActivity> logger)
    {
        _db = db;
        _blobs = blobs;
        _httpClients = httpClients;
        _logger = logger;
    }

    [Function(nameof(RenderPdfReportActivity))]
    public async Task Run(
        [ActivityTrigger] string sampleId,
        FunctionContext context)
    {
        _logger.LogInformation("Rendering report document for sample {SampleId}", sampleId);

        var sample = await _db.Samples.FirstOrDefaultAsync(s => s.SampleId == sampleId && !s.IsDeleted)
            ?? throw new InvalidOperationException($"Sample {sampleId} not found.");

        var encodedSampleId = WebUtility.HtmlEncode(sample.SampleId);
        var html = $$"""
            <!doctype html><html><head><meta charset="utf-8"><title>Draft sample report</title>
            <style>body{font-family:Arial,sans-serif;margin:40px;color:#172033}header{border-bottom:2px solid #16786a;padding-bottom:16px}.notice{background:#fff4ce;padding:16px;margin:24px 0}dt{font-weight:bold}dd{margin:0 0 12px}</style>
            </head><body><header><h1>Panancia.S — Draft Sample Report</h1></header>
            <div class="notice"><strong>DRAFT — NOT A DIAGNOSTIC RESULT.</strong><br>
            This document requires authorized clinical review and sign-off. No measurement values are included because verified measurement results were not available to this activity.</div>
            <dl><dt>Sample reference</dt><dd>{{encodedSampleId}}</dd>
            <dt>Sample created (UTC)</dt><dd>{{sample.CreatedAtUtc:O}}</dd>
            <dt>Workflow state</dt><dd>{{WebUtility.HtmlEncode(sample.State)}}</dd>
            <dt>Generated (UTC)</dt><dd>{{DateTime.UtcNow:O}}</dd></dl>
            </body></html>
            """;

        using var form = new MultipartFormDataContent();
        form.Add(new StringContent(html, Encoding.UTF8, "text/html"), "files", "index.html");
        var gotenberg = _httpClients.CreateClient("gotenberg");
        using var response = await gotenberg.PostAsync("/forms/chromium/convert/html", form);
        if (!response.IsSuccessStatusCode)
            throw new InvalidOperationException($"Gotenberg returned HTTP {(int)response.StatusCode}.");

        var pdfBytes = await response.Content.ReadAsByteArrayAsync();
        if (pdfBytes.Length < 5 || !pdfBytes.AsSpan(0, 5).SequenceEqual("%PDF-"u8))
            throw new InvalidOperationException("Gotenberg did not return a valid PDF payload.");

        var version = (sample.ReportVersion ?? 0) + 1;
        var blob = _blobs.GetBlobContainerClient("quarantine")
            .GetBlobClient($"{sampleId}_v{version}_draft.pdf");
        using var pdfStream = new MemoryStream(pdfBytes, writable: false);
        await blob.UploadAsync(pdfStream, new BlobUploadOptions
        {
            HttpHeaders = new BlobHttpHeaders { ContentType = "application/pdf" }
        });

        sample.DraftReportPdfUri = blob.Uri.ToString();
        sample.ReportVersion = version;
        sample.ContentSha256 = Convert.ToHexString(SHA256.HashData(pdfBytes)).ToLowerInvariant();
        await _db.SaveChangesAsync();

        _logger.LogInformation("Draft report recorded for sample {SampleId} with version {Version} and hash {Hash}",
            sampleId, sample.ReportVersion, sample.ContentSha256);
    }
}
