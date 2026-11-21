using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Penancia.S.Api.Controllers.V1;

/// <summary>
/// Controller for Patient Educational Assistant (Azure AI Foundry / Narrative Guardrail).
/// Enforces clinical safety: strictly answers educational & procedural queries;
/// rejects clinical decision requests and redirects to licensed physician consultation.
/// </summary>
[ApiController]
[Route("v1/ask")]
[Authorize]
public class AskController : ControllerBase
{
    private readonly ILogger<AskController> _logger;

    public AskController(ILogger<AskController> logger)
    {
        _logger = logger;
    }

    // #23: this controller returns ONLY hardcoded template strings. It never
    // calls a Foundry model, so the honest mode label is 'template-only'.
    // The previous 'Foundry-Responses-API-Narrative' label was false and is
    // removed. AskRequest.LlmMode is accepted but ignored: no LLM mode exists.
    [HttpPost]
    public IActionResult Ask([FromBody] AskRequest? request)
    {
        if (request is null)
            return BadRequest(new { error = "Request body is required." });

        string question = request.Question?.Trim() ?? string.Empty;
        string lang = request?.Language?.ToLowerInvariant() ?? "en";
        bool isAr = lang.StartsWith("ar");

        if (string.IsNullOrWhiteSpace(question))
        {
            return BadRequest(new { error = "Question cannot be empty." });
        }

        string qLower = question.ToLowerInvariant();

        // 1. Clinical Safety Guardrail: Banned diagnostic / clinical prescription patterns
        bool isClinicalDecision =
            qLower.Contains("diagnose") || qLower.Contains("am i infertile") ||
            qLower.Contains("sterile") || qLower.Contains("treatment") ||
            qLower.Contains("prescribe") || qLower.Contains("cure") ||
            qLower.Contains("علاج") || qLower.Contains("تشخيص") ||
            qLower.Contains("هل أنا عقيم") || qLower.Contains("دواء");

        if (isClinicalDecision)
        {
            _logger.LogInformation("Ask request triggered clinical decision guardrail: {Question}", question);

            string alertText = isAr
                ? "تنبيه طبي: منصة بينانسيا هي أداة تعليمية وفحص أولي للمختبر. بموجب اللوائح الصحية وحوكمة الرعاية السريرية، يجب دائماً استشارة طبيب مسجل لتشخيص الحالة أو وصف العلاج. يمكنك حجز استشارة أو فحص تشخيصي لدى شريك معتمد في دبي."
                : "Clinical Notice: Penancia.S is an educational and pre-screening laboratory tool. Under UAE healthcare governance and clinical safety protocols, medical diagnoses and therapeutic prescriptions must be evaluated by a licensed physician. We encourage you to book a diagnostic consultation with an accredited Dubai partner clinic.";

            return Ok(new
            {
                text = alertText,
                answer = alertText,
                urgentAlert = false,
                sourceLabels = new[] { "Clinical Safety Guardrail", "UAE Healthcare Regulatory Standards" },
                buttons = new[]
                {
                    new { labelEn = "Book Accredited Lab Appointment", labelAr = "حجز موعد في مختبر معتمد", action = "open_booking" }
                },
                modeUsed = "template-only"
            });
        }

        // 2. Educational & WHO 2021 Reference Q&A
        string answerText;
        string[] sources;

        if (qLower.Contains("who") || qLower.Contains("reference") || qLower.Contains("motility") || qLower.Contains("حركة") || qLower.Contains("معايير"))
        {
            answerText = isAr
                ? "وفقاً لدليل منظمة الصحة العالمية لعام 2021 (الإصدار السادس): الحد الأدنى لحجم السائل المنوي هو 1.4 مل، والتركيز الأدنى للحيوانات المنوية هو 16 مليون/مل، وإجمالي الحركة التقدمية وغير التقدمية هو 42% (مع 30% حركة تقدمية كحد أدنى)، ونسبة الأشكال الطبيعية 4% كحد أدنى."
                : "According to the WHO 2021 Laboratory Manual (6th Edition): the lower reference limit for semen volume is 1.4 mL, sperm concentration is 16 million/mL, total motility is 42% (with progressive motility at ≥ 30%), and normal morphology is 4.0%. Any parameter below these thresholds indicates a clinical review is advisable.";
            sources = new[] { "WHO Laboratory Manual (6th Edition, 2021)", "Penancia.S Clinical Knowledge Base" };
        }
        else if (qLower.Contains("abstinence") || qLower.Contains("امتناع") || qLower.Contains("collect") || qLower.Contains("جمع"))
        {
            answerText = isAr
                ? "توصي إرشادات منظمة الصحة العالمية بفترة امتناع عن القذف تتراوح بين 2 إلى 7 أيام قبل جمع العينة، مع الحفاظ على درجة حرارة العينة بين 20 و37 درجة مئوية وتوصيلها إلى المختبر في غضون 60 دقيقة لضمان دقة قياس الحركة."
                : "WHO 2021 standard guidelines recommend an ejaculatory abstinence period of 2 to 7 days before sample collection. The sample should be maintained between 20°C and 37°C and delivered to the laboratory within 60 minutes to prevent motility degradation.";
            sources = new[] { "WHO 2021 Pre-analytical Protocols", "Dubai Health Authority Clinical Guidelines" };
        }
        else
        {
            answerText = isAr
                ? "مرحباً بك في مساعد بينانسيا الصحي. يمكنك سؤالي عن معايير منظمة الصحة العالمية 2021، أو خطوات جمع العينات، أو تفاصيل حجز المواعيد في مختبرات دبي المعتمدة."
                : "Welcome to Penancia Assistant. I can help explain WHO 2021 semen analysis reference limits, sample collection protocols, report parameters, or how to schedule an accredited Dubai laboratory appointment.";
            sources = new[] { "Penancia.S Educational Services" };
        }

        return Ok(new
        {
            text = answerText,
            answer = answerText,
            urgentAlert = false,
            sourceLabels = sources,
            buttons = Array.Empty<object>(),
            modeUsed = "template-only"
        });
    }
}

public class AskRequest
{
    public string? Question { get; set; }
    public string? Language { get; set; }
    public string? LlmMode { get; set; }
}
