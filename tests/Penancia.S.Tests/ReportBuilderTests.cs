using System.Text.Json;
using Penancia.S.Domain.Model;
using Penancia.S.Domain.Parameters;
using Penancia.S.Domain.Reporting;
using Penancia.S.Domain.Rules;
using Xunit;

namespace Penancia.S.Tests;

/// <summary>
/// Unit tests for ReportBuilder, content_sha256 stability, and schema invariants from Section 16.
/// </summary>
public class ReportBuilderTests
{
    private static readonly Calibration Cal = new(1.0, 60.0, 20.0);
    private static readonly DateTimeOffset T = new(2026, 11, 20, 12, 0, 0, TimeSpan.Zero);

    private static EvaluationResult CreateSampleEvaluation()
    {
        var measurements = new Dictionary<string, Measurement>
        {
            ["B.volume_ml"] = Measurement.Numeric("B.volume_ml", 2.5m, "mL", Provenance.Manual("tech-1", T)),
            ["B.ph"] = Measurement.Numeric("B.ph", 7.4m, "", Provenance.Manual("tech-1", T)),
            ["C.conc_reported_mpml"] = Measurement.Numeric("C.conc_reported_mpml", 25.0m, "million/mL", Provenance.Manual("tech-1", T)),
            ["D.pr_pct"] = Measurement.Numeric("D.pr_pct", 35.0m, "%", Provenance.Manual("tech-1", T)),
            ["D.np_pct"] = Measurement.Numeric("D.np_pct", 15.0m, "%", Provenance.Manual("tech-1", T)),
            ["F.vitality_pct"] = Measurement.Numeric("F.vitality_pct", 65.0m, "%", Provenance.Manual("tech-1", T))
        };

        return RulesEngine.Evaluate(measurements, ParameterSet.Placeholder);
    }

    // Every Required field in FieldCatalog, present and passing its rule, so the
    // evaluation is complete (IsComplete == true). Derived fields (total motility,
    // total number) are left for the engine to derive.
    private static EvaluationResult CreateCompleteEvaluation()
    {
        Measurement Num(string id, decimal v, string unit) => Measurement.Numeric(id, v, unit, Provenance.Manual("tech-1", T));
        Measurement Txt(string id, string text) => Measurement.Text(id, text, Provenance.Manual("tech-1", T));
        var measurements = new Dictionary<string, Measurement>
        {
            ["A.patient_ref"] = Txt("A.patient_ref", "P-1"),
            ["A.collection_datetime"] = Txt("A.collection_datetime", "2026-11-20T10:00:00Z"),
            ["A.abstinence_days"] = Num("A.abstinence_days", 4m, "days"),
            ["A.collection_complete"] = Txt("A.collection_complete", "Yes"),
            ["B.volume_ml"] = Num("B.volume_ml", 2.5m, "mL"),
            ["B.ph"] = Num("B.ph", 7.4m, ""),
            ["B.liquefaction_min"] = Num("B.liquefaction_min", 30m, "min"),
            ["B.viscosity"] = Txt("B.viscosity", "Normal"),
            ["B.appearance"] = Txt("B.appearance", "Normal"),
            ["C.conc_reported_mpml"] = Num("C.conc_reported_mpml", 25.0m, "million/mL"),
            ["D.pr_pct"] = Num("D.pr_pct", 35.0m, "%"),
            ["D.np_pct"] = Num("D.np_pct", 15.0m, "%"),
            ["D.im_pct"] = Num("D.im_pct", 50.0m, "%"),
            ["D.tracks_used"] = Num("D.tracks_used", 200m, "tracks"),
            ["D.tracks_excluded"] = Num("D.tracks_excluded", 5m, "tracks"),
            ["E.normal_forms_pct"] = Num("E.normal_forms_pct", 5.0m, "%"),
            ["E.head_counts"] = Num("E.head_counts", 200m, ""),
            ["E.midpiece_tail_review"] = Txt("E.midpiece_tail_review", "Reviewed"),
            ["F.vitality_pct"] = Num("F.vitality_pct", 65.0m, "%"),
            ["I.calibration_um_per_px"] = Num("I.calibration_um_per_px", 0.5m, "µm/px"),
            ["I.fps"] = Num("I.fps", 60m, "fps"),
            ["I.chamber_depth_um"] = Num("I.chamber_depth_um", 20m, "µm"),
            ["I.qc_results"] = Txt("I.qc_results", "Pass"),
            ["I.operator_verified_by"] = Txt("I.operator_verified_by", "qc-1"),
            ["J.narrative"] = Txt("J.narrative", "Narrative"),
            ["J.limitations"] = Txt("J.limitations", "Limitations"),
            ["J.signoff"] = Txt("J.signoff", "Sign-off")
        };

        return RulesEngine.Evaluate(measurements, ParameterSet.Placeholder);
    }

    private static ReportModel BuildReport(EvaluationResult eval, ReportSignoff? signoff, string template = "Template narrative text.") =>
        ReportBuilder.Build(
            sampleId: "SAM-001",
            version: 1,
            eval: eval,
            parameters: ParameterSet.Placeholder,
            calibration: Cal,
            templateNarrative: template,
            llmNarrative: null,
            llmRejectedReason: null,
            signoff: signoff,
            generatedAt: T);

    [Fact]
    public void Build_DraftReport_HasContentHash_AndDraftStatus()
    {
        var eval = CreateSampleEvaluation();
        Assert.False(eval.IsComplete); // the 6-measurement sample is incomplete — that is why the status is Draft


        var report = ReportBuilder.Build(
            sampleId: "SAM-001",
            version: 1,
            eval: eval,
            parameters: ParameterSet.Placeholder,
            calibration: Cal,
            templateNarrative: "Template narrative text.",
            llmNarrative: null,
            llmRejectedReason: null,
            signoff: null,
            generatedAt: T);

        Assert.Equal("Draft", report.Report.Status);
        Assert.NotNull(report.Report.ContentSha256);
        Assert.Equal(64, report.Report.ContentSha256.Length); // 64 hex characters (SHA-256)
        Assert.Null(report.Signoff);
    }

    [Fact]
    public void Build_WithSignoff_HasFinalStatus_AndBindsToHash()
    {
        // Final requires BOTH a sign-off and a complete evaluation.
        var eval = CreateCompleteEvaluation();
        Assert.True(eval.IsComplete);

        var signoff = new ReportSignoff(
            SignerId: "DrDirector",
            Role: "ClinicalDirector",
            SignedAt: T.AddHours(1),
            Statement: "I have reviewed and approved these clinical findings.");

        var report = BuildReport(eval, signoff);

        Assert.Equal("Final", report.Report.Status);
        Assert.NotNull(report.Signoff);
        Assert.Equal("DrDirector", report.Signoff.SignerId);
        Assert.NotNull(report.Report.ContentSha256);
        Assert.NotNull(report.Report.SignoffSha256);
    }

    [Fact]
    public void Build_DraftAwaitingSignoff_WhenEvaluationComplete_AndNoSignoff()
    {
        var eval = CreateCompleteEvaluation();
        Assert.True(eval.IsComplete);

        var report = BuildReport(eval, null);

        Assert.Equal("DraftAwaitingSignoff", report.Report.Status);
        Assert.Null(report.Signoff);
        Assert.Null(report.Report.SignoffSha256);
    }

    [Fact]
    public void Build_WithSignoff_ButIncompleteEvaluation_IsNotFinal()
    {
        var eval = CreateSampleEvaluation();
        Assert.False(eval.IsComplete);

        var signoff = new ReportSignoff("DrDirector", "ClinicalDirector", T.AddHours(1), "Reviewed.");
        var report = BuildReport(eval, signoff);

        Assert.NotEqual("Final", report.Report.Status);
        Assert.Contains("SIGNED_WHILE_INCOMPLETE", report.Banners);
    }

    [Fact]
    public void ContentHash_IsDeterministic_ForIdenticalInput()
    {
        var report1 = BuildReport(CreateSampleEvaluation(), null);
        var report2 = BuildReport(CreateSampleEvaluation(), null);

        Assert.Equal(report1.Report.ReportId, report2.Report.ReportId);
        Assert.Equal(report1.Report.ContentSha256, report2.Report.ContentSha256);
    }

    [Fact]
    public void ContentHash_UnchangedBySignoff_SignoffHashChanges()
    {
        var draft = BuildReport(CreateCompleteEvaluation(), null);
        var signoff = new ReportSignoff("DrDirector", "ClinicalDirector", T.AddHours(1), "Reviewed.");
        var final = BuildReport(CreateCompleteEvaluation(), signoff);
        var otherSignoff = new ReportSignoff("DrOther", "Signer", T.AddHours(2), "Reviewed by another signer.");
        var finalOther = BuildReport(CreateCompleteEvaluation(), otherSignoff);

        // The content hash is computed over the report with Signoff null, so two
        // Finals over identical content hash identically even though the sign-off
        // differs. (A Draft hashes differently from a Final because Status is part
        // of the hashed report — that is intended: the status is content.)
        Assert.Equal(final.Report.ContentSha256, finalOther.Report.ContentSha256);
        // The sign-off hash binds the sign-off: absent without one, present with
        // one, and different for a different sign-off.
        Assert.Null(draft.Report.SignoffSha256);
        Assert.NotNull(final.Report.SignoffSha256);
        Assert.NotEqual(final.Report.SignoffSha256, finalOther.Report.SignoffSha256);
    }

    [Fact]
    public void Build_UnvalidatedLlmNarrative_FallsBackToTemplate()
    {
        var eval = CreateSampleEvaluation();
        // Hallucinated number 99.9 is not in the evaluated rows or WHO limits.
        var report = ReportBuilder.Build(
            sampleId: "SAM-001",
            version: 1,
            eval: eval,
            parameters: ParameterSet.Placeholder,
            calibration: Cal,
            templateNarrative: "Template narrative text.",
            llmNarrative: "Sperm concentration is 99.9 M/mL.",
            llmRejectedReason: null,
            signoff: null,
            generatedAt: T);

        Assert.Equal("Template narrative text.", report.Narrative.FinalText);
        Assert.NotNull(report.Narrative.LlmRejectedReason);
        Assert.Contains("Hallucinated number", report.Narrative.LlmRejectedReason);
    }

    [Fact]
    public void ContentHash_ChangesWhenAnyValueChanges()
    {
        var eval1 = CreateSampleEvaluation();

        var report1 = ReportBuilder.Build(
            sampleId: "SAM-001",
            version: 1,
            eval: eval1,
            parameters: ParameterSet.Placeholder,
            calibration: Cal,
            templateNarrative: "Template narrative.",
            llmNarrative: null,
            llmRejectedReason: null,
            signoff: null,
            generatedAt: T);

        // Different volume
        var m2 = new Dictionary<string, Measurement>
        {
            ["B.volume_ml"] = Measurement.Numeric("B.volume_ml", 3.0m, "mL", Provenance.Manual("tech-1", T))
        };
        var eval2 = RulesEngine.Evaluate(m2, ParameterSet.Placeholder);

        var report2 = ReportBuilder.Build(
            sampleId: "SAM-001",
            version: 1,
            eval: eval2,
            parameters: ParameterSet.Placeholder,
            calibration: Cal,
            templateNarrative: "Template narrative.",
            llmNarrative: null,
            llmRejectedReason: null,
            signoff: null,
            generatedAt: T);

        Assert.NotEqual(report1.Report.ContentSha256, report2.Report.ContentSha256);
    }

    [Fact]
    public void Report_SerializesToValidJson()
    {
        var eval = CreateSampleEvaluation();
        var report = ReportBuilder.Build(
            sampleId: "SAM-001",
            version: 1,
            eval: eval,
            parameters: ParameterSet.Placeholder,
            calibration: Cal,
            templateNarrative: "Template text.",
            llmNarrative: null,
            llmRejectedReason: null,
            signoff: null,
            generatedAt: T);

        string json = JsonSerializer.Serialize(report);
        Assert.Contains("\"schema_version\":\"1.0\"", json);
        Assert.Contains("\"sample_id\":\"SAM-001\"", json);
    }
}
