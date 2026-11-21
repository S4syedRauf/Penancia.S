using System.Globalization;
using Penancia.S.Domain.Fields;
using Penancia.S.Domain.Model;
using Penancia.S.Domain.Parameters;

namespace Penancia.S.Domain.Rules;

public sealed record EvaluationRow(
    string FieldId,
    string Label,
    decimal? Value,
    string? TextValue,
    string Unit,
    string? DisplayValue,
    string? ReferenceText,
    ResultState ResultState,
    IReadOnlyList<string> Flags,
    Provenance? Provenance);

public sealed record EvaluationResult(
    IReadOnlyList<EvaluationRow> Rows,
    IReadOnlyList<ClinicalFlag> Flags,
    IReadOnlyList<ClinicalFlag> Blocking,
    bool IsComplete,
    IReadOnlyList<string> Banners);

public static class RulesEngine
{
    public static EvaluationResult Evaluate(
        IReadOnlyDictionary<string, Measurement> measurements,
        ParameterSet parameters,
        IReadOnlyList<Rule>? rules = null)
    {
        ArgumentNullException.ThrowIfNull(measurements);
        ArgumentNullException.ThrowIfNull(parameters);
        rules ??= RuleTable.LowerReferenceLimits;
        var ruleMap = rules.ToDictionary(r => r.FieldId);

        var flags = new List<ClinicalFlag>();
        var banners = new List<string>();

        // Check if parameter set is validated
        if (!parameters.Validated)
        {
            banners.Add("NOT_VALIDATED");
            flags.Add(FlagCatalog.NotValidated());
        }

        // 1. Build Derived Fields.
        // DECISION (2026-11-21): caller-supplied values are PRESERVED — a derived
        // value is computed only when the caller did not supply that field. The
        // previous code silently overwrote caller-supplied values, so a resolver
        // or manual entry could be discarded without any trace.
        var allMeasurements = new Dictionary<string, Measurement>(measurements);

        // Derived: Total Motility = PR + NP
        if (!allMeasurements.ContainsKey("D.total_motility_pct") &&
            allMeasurements.TryGetValue("D.pr_pct", out var mPr) && mPr.Value.HasValue &&
            allMeasurements.TryGetValue("D.np_pct", out var mNp) && mNp.Value.HasValue)
        {
            decimal tm = mPr.Value.Value + mNp.Value.Value;
            var prov = Provenance.Derived(new[] { "D.pr_pct", "D.np_pct" });
            allMeasurements["D.total_motility_pct"] = Measurement.Numeric("D.total_motility_pct", tm, "%", prov);
        }

        // Derived: Total Sperm Count = Volume * Reported Concentration
        if (!allMeasurements.ContainsKey("C.total_number_million") &&
            allMeasurements.TryGetValue("B.volume_ml", out var mVol) && mVol.Value.HasValue &&
            allMeasurements.TryGetValue("C.conc_reported_mpml", out var mConc) && mConc.Value.HasValue)
        {
            decimal totalCount = mVol.Value.Value * mConc.Value.Value;
            var prov = Provenance.Derived(new[] { "B.volume_ml", "C.conc_reported_mpml" });
            allMeasurements["C.total_number_million"] = Measurement.Numeric("C.total_number_million", totalCount, "million", prov);
        }

        var rows = new List<EvaluationRow>();

        // 2. Evaluate every field in catalog
        foreach (var def in FieldCatalog.All)
        {
            string fieldId = def.Id;
            allMeasurements.TryGetValue(fieldId, out var m);

            FieldStatus status = m?.Status ?? FieldStatus.Missing;
            decimal? val = m?.Value;
            string? textVal = m?.TextValue;
            var prov = m?.Provenance;
            var rowFlags = new List<string>();

            ResultState state;
            string? display = null;
            string? refText = null;

            if (prov?.Unverified == true)
            {
                rowFlags.Add("UNVERIFIED");
                flags.Add(FlagCatalog.Unverified(fieldId));
            }
            // Provenance that fails its own consistency check (e.g. an automated
            // value with no recorded model version/commit, or a manual value with
            // no enterer/timestamp) is unverified, even if Unverified was not set.
            else if (prov is { IsConsistent: false })
            {
                rowFlags.Add("UNVERIFIED");
                flags.Add(FlagCatalog.Unverified(fieldId, "Provenance failed its consistency check."));
            }

            switch (status)
            {
                case FieldStatus.Missing:
                case FieldStatus.Failed:
                    state = ResultState.Incomplete;
                    rowFlags.Add("INCOMPLETE");
                    display = "—";
                    break;

                case FieldStatus.NotPerformed:
                    state = ResultState.NotPerformed;
                    display = "Not performed";
                    break;

                case FieldStatus.NotApplicable:
                    state = ResultState.NotApplicable;
                    display = "N/A";
                    break;

                default: // Present
                    if (val.HasValue)
                    {
                        // DECISION RECORD — round-then-compare (deliberate, kept).
                        // What is printed is what is judged against the limit: the
                        // value is rounded half away from zero to the field's display
                        // precision (FieldCatalog.RoundForDisplay) and the ROUNDED value
                        // is compared to the WHO 2021 limit. E.g. concentration 15.96
                        // displays as 16.0 and PASSES >= 16; 15.94 displays as 15.9 and
                        // FAILS. Rationale: the report shows the rounded value, so
                        // judging the unrounded value would contradict the printed
                        // report. This needs clinical-lead sign-off; if the lead
                        // requires raw-value comparison, change the comparison below
                        // to use val.Value and round only for display. Pinned by
                        // RulesEngineBoundaryTests.Concentration15Point96 tests.
                        decimal rounded = FieldCatalog.RoundForDisplay(fieldId, val.Value);
                        display = def.DisplayDecimals.HasValue
                            ? rounded.ToString($"F{def.DisplayDecimals.Value}", CultureInfo.InvariantCulture)
                            : rounded.ToString(CultureInfo.InvariantCulture);

                        if (ruleMap.TryGetValue(fieldId, out var rule))
                        {
                            // Reference text uses the rule's actual operator — never
                            // a hardcoded "≥" (an upper-limit rule renders "≤").
                            string opText = rule.Op switch
                            {
                                ComparisonOp.GreaterThanOrEqual => "≥",
                                ComparisonOp.LessThanOrEqual => "≤",
                                ComparisonOp.Equal => "=",
                                _ => ""
                            };
                            // Format the limit with the field's display precision,
                            // like DisplayValue: the leukocyte limit 1.0 must render
                            // "1.0", not "1" (decimal.ToString drops the trailing zero).
                            string limitText = def.DisplayDecimals.HasValue
                                ? rule.Limit.ToString($"F{def.DisplayDecimals.Value}", CultureInfo.InvariantCulture)
                                : rule.Limit.ToString(CultureInfo.InvariantCulture);
                            refText = $"{opText} {limitText} {rule.Unit}".Trim();
                            bool passes = rule.Op switch
                            {
                                ComparisonOp.GreaterThanOrEqual => rounded >= rule.Limit,
                                ComparisonOp.LessThanOrEqual => rounded <= rule.Limit,
                                ComparisonOp.Equal => rounded == rule.Limit,
                                _ => true
                            };

                            if (passes)
                            {
                                state = ResultState.WithinReference;
                            }
                            else
                            {
                                // A failing upper-limit rule is AboveReference, never
                                // BelowReference, and the failure is recorded as a
                                // ClinicalFlag on the result (not just the row's string
                                // list) so narrative generation cannot claim that all
                                // parameters meet the limits on an abnormal report.
                                bool isUpperLimit = rule.Op == ComparisonOp.LessThanOrEqual;
                                state = isUpperLimit ? ResultState.AboveReference : ResultState.BelowReference;
                                rowFlags.Add(rule.FlagCode);
                                flags.Add(isUpperLimit
                                    ? FlagCatalog.AboveReference(fieldId)
                                    : FlagCatalog.BelowReference(fieldId));
                            }
                        }
                        else
                        {
                            state = ResultState.NoReferenceLimit;
                        }
                    }
                    else
                    {
                        // A present field with no numeric value was never checked
                        // against any limit — it must NOT be labelled WithinReference.
                        state = ResultState.NoReferenceLimit;
                        display = textVal ?? "Recorded";
                    }
                    break;
            }

            rows.Add(new EvaluationRow(
                FieldId: fieldId,
                Label: def.Label,
                Value: val,
                TextValue: textVal,
                Unit: def.Unit ?? "",
                DisplayValue: display,
                ReferenceText: refText,
                ResultState: state,
                Flags: rowFlags,
                Provenance: prov
            ));
        }

        // 3. Consistency rules.
        // IMPLEMENTED here: X-1 (motility vs vitality), X-2 (percentage sum —
        // see note below), X-7 (debris). NOT implemented: X-3 to X-6 and X-8 to
        // X-11 — their definitions exist in neither the code nor the review
        // record, so they cannot be implemented correctly from the data and
        // patterns available. They remain open items for the clinical lead to
        // define. The previous comment claimed "X-1 to X-11" while only X-1
        // and X-7 existed; that overclaim is corrected here.
        // X-1: Motility vs Vitality
        if (allMeasurements.TryGetValue("D.total_motility_pct", out var mot) && mot.Value.HasValue &&
            allMeasurements.TryGetValue("F.vitality_pct", out var vit) && vit.Value.HasValue)
        {
            if (mot.Value.Value > vit.Value.Value + parameters.MotilityVitalityTolerancePp)
            {
                flags.Add(FlagCatalog.MotilityExceedsVitality());
            }
        }

        // X-2: Percentage sum PR + NP + IM must equal 100% (within tolerance).
        // NOTE: the "X-2" number is assigned by this fix because the original
        // X-2 definition was not available in the repo; confirm the numbering
        // with the clinical lead. The check itself follows the existing pattern
        // (MotilityResolver rejects a bad sum as unusable) and emits a Blocking
        // ClinicalFlag via FlagCatalog, so Completeness.IsComplete now fails
        // when the motility percentages do not sum — previously the engine
        // never created a Severity.Blocking flag.
        if (allMeasurements.TryGetValue("D.pr_pct", out var pr) && pr.Value.HasValue &&
            allMeasurements.TryGetValue("D.np_pct", out var np) && np.Value.HasValue &&
            allMeasurements.TryGetValue("D.im_pct", out var im) && im.Value.HasValue)
        {
            decimal sum = pr.Value.Value + np.Value.Value + im.Value.Value;
            if (Math.Abs(sum - 100m) > parameters.PercentSumTolerancePp)
            {
                flags.Add(FlagCatalog.PercentSumInvalid("D.pr_pct",
                    $"Percentage sum PR+NP+IM is {sum.ToString(CultureInfo.InvariantCulture)}%, expected 100%."));
            }
        }

        // X-7: Debris
        if (allMeasurements.TryGetValue("C.debris_fraction", out var deb) && deb.Value.HasValue)
        {
            if (deb.Value.Value > parameters.DebrisFractionWarn)
            {
                flags.Add(FlagCatalog.DebrisHigh());
            }
        }

        // 4. Completeness
        var blocking = flags.Where(f => f.Severity == Severity.Blocking).ToList();
        bool isComplete = Completeness.IsComplete(allMeasurements, blocking);

        return new EvaluationResult(rows, flags, blocking, isComplete, banners);
    }
}
