using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Penancia.S.Domain.Kinematics;
using Penancia.S.Domain.Model;
using Penancia.S.Domain.Narrative;
using Penancia.S.Domain.Parameters;
using Penancia.S.Domain.Rules;

namespace Penancia.S.Domain.Reporting;

public static class ReportBuilder
{
    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        WriteIndented = false
    };

    public static ReportModel Build(
        string sampleId,
        int version,
        EvaluationResult eval,
        ParameterSet parameters,
        Calibration calibration,
        string templateNarrative,
        string? llmNarrative,
        string? llmRejectedReason,
        ReportSignoff? signoff,
        DateTimeOffset generatedAt,
        string? supersedesReportId = null)
    {
        ArgumentNullException.ThrowIfNull(eval);
        ArgumentNullException.ThrowIfNull(parameters);
        ArgumentNullException.ThrowIfNull(calibration);

        // A signed-off but incomplete report must NOT be "Final" — Final requires
        // both a sign-off and a complete evaluation.
        string status = signoff != null && eval.IsComplete
            ? "Final"
            : (eval.IsComplete ? "DraftAwaitingSignoff" : "Draft");
        var banners = new List<string>(eval.Banners);
        if (signoff != null && !eval.IsComplete)
            banners.Add("SIGNED_WHILE_INCOMPLETE");

        // Group rows by section
        var sectionGroups = eval.Rows
            .GroupBy(r => r.FieldId.Split('.')[0])
            .Select(g => new ReportSection(
                Id: g.Key,
                Title: GetSectionTitle(g.Key),
                Rows: g.Select(r => new ReportSectionRow(
                    FieldId: r.FieldId,
                    Label: r.Label,
                    Value: r.Value,
                    TextValue: r.TextValue,
                    Unit: r.Unit,
                    Display: r.DisplayValue,
                    Reference: r.ReferenceText,
                    ResultState: r.ResultState.ToString(),
                    Flags: r.Flags,
                    Source: r.Provenance
                )).ToList()
            )).ToList();

        var flagsList = eval.Flags.Select(f => new ReportFlag(
            Code: f.Code,
            Severity: f.Severity.ToString(),
            FieldId: f.FieldId,
            Detail: f.Detail
        )).ToList();

        // Narrative validation runs INSIDE Build: unvalidated free LLM text must
        // never ship in a clinical report, even if the caller forgot the guardrail
        // step. The structured validator checks every number against the evaluated
        // rows + WHO limits and requires every input flag to be covered by a
        // sentence (or ALL_NORMAL for an all-normal report). On failure, fall back
        // to the template narrative and record the rejection reason.
        string? effectiveRejection = llmRejectedReason;
        string finalText = templateNarrative;
        if (string.IsNullOrWhiteSpace(effectiveRejection) && !string.IsNullOrWhiteSpace(llmNarrative))
        {
            var sentenceItems = eval.Flags
                .Where(f => f.Code != "UNVERIFIED" && f.Code != "NOT_VALIDATED")
                .Select(f => f.Code).Distinct()
                .Select(code => new NarrativeSentenceItem(code, llmNarrative)).ToList();
            if (sentenceItems.Count == 0)
                sentenceItems.Add(new NarrativeSentenceItem("ALL_NORMAL", llmNarrative));
            var validation = NarrativeValidator.Validate(
                new NarrativeInput(eval.Rows, eval.Flags),
                new NarrativeOutput(sentenceItems, llmNarrative));
            if (validation.IsValid)
            {
                finalText = llmNarrative;
            }
            else
            {
                effectiveRejection = validation.RejectionReason;
            }
        }

        var narrativeObj = new ReportNarrative(
            TemplateText: templateNarrative,
            LlmText: llmNarrative,
            FinalText: finalText,
            LlmRejectedReason: effectiveRejection
        );

        var paramInfo = new ParameterInfo(parameters.Id, parameters.Validated, parameters.ManifestId);

        // Kinematics conventions come from the single source of truth
        // (KinematicsConventions constants), never reworded copies — the previous
        // literals drifted from the constants. Keys use the renamed, non-standard
        // output names (see KinematicsTypes).
        var provObj = new ReportProvenance(
            Calibration: calibration,
            KinematicsConventions: new Dictionary<string, string>
            {
                ["alh_two_x_mean_deviation_um"] = KinematicsConventions.Alh,
                ["bcf_crossings_per_sec"] = KinematicsConventions.Bcf,
                ["smoothing_window"] = parameters.SmoothingWindowPoints.ToString(CultureInfo.InvariantCulture)
            }
        );

        // Deterministic content hash. The report ID is STABLE (sample + version),
        // never Guid.NewGuid(): identical input must hash identically. The content
        // hash covers the report with ContentSha256/SignoffSha256 null and Signoff
        // null; the sign-off is hashed SEPARATELY (content hash + sign-off JSON)
        // and stored as SignoffSha256, so tampering with the sign-off changes the
        // stored hash. Serialization is deterministic: fixed property order,
        // camelCase, no indentation, and all collections built in fixed order.
        var interimReport = new ReportHeader(
            ReportId: $"{sampleId}-v{version}",
            SampleId: sampleId,
            Version: version,
            Status: status,
            GeneratedAt: generatedAt,
            ContentSha256: null,
            SignoffSha256: null,
            SupersedesReportId: supersedesReportId
        );

        var interimModel = new ReportModel(
            SchemaVersion: "1.0",
            Report: interimReport,
            Banners: banners,
            ParameterSet: paramInfo,
            Sections: sectionGroups,
            Flags: flagsList,
            Narrative: narrativeObj,
            Signoff: null,
            Provenance: provObj
        );

        string jsonToHash = JsonSerializer.Serialize(interimModel, JsonOpts);
        string contentHash = ComputeSha256Hex(jsonToHash);

        string? signoffHash = null;
        if (signoff != null)
        {
            string signoffJson = JsonSerializer.Serialize(signoff, JsonOpts);
            signoffHash = ComputeSha256Hex(contentHash + "\n" + signoffJson);
        }

        var finalHeader = interimReport with { ContentSha256 = contentHash, SignoffSha256 = signoffHash };
        return interimModel with { Report = finalHeader, Signoff = signoff };
    }

    private static string ComputeSha256Hex(string input)
    {
        byte[] bytes = SHA256.HashData(Encoding.UTF8.GetBytes(input));
        return Convert.ToHexString(bytes).ToLowerInvariant();
    }

    private static string GetSectionTitle(string sectionKey) => sectionKey switch
    {
        "A" => "Patient and Collection",
        "B" => "Macroscopic Examination",
        "C" => "Concentration and Count",
        "D" => "Motility and Kinematics",
        "E" => "Morphology",
        "F" => "Vitality",
        "G" => "DNA Fragmentation",
        "H" => "Extended Testing",
        "I" => "Quality Control and Calibration",
        "J" => "Narrative and Sign-off",
        _ => "General Examination"
    };
}
