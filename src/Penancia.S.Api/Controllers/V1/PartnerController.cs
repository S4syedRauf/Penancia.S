using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Penancia.S.Data;
using Penancia.S.Data.Entities;

namespace Penancia.S.Api.Controllers.V1;

/// <summary>
/// Controller for the Clinical Partner Portal.
/// Manages lab sample custody transitions, clinic onboarding applications, and technician sign-offs.
/// </summary>
[ApiController]
[Route("v1/partner")]
[Authorize]
public class PartnerController : ControllerBase
{
    private readonly PenanciaDbContext _db;
    private readonly ILogger<PartnerController> _logger;

    public PartnerController(PenanciaDbContext db, ILogger<PartnerController> logger)
    {
        _db = db;
        _logger = logger;
    }

    // Allowed order statuses (#9): exactly the values already used in the
    // code (CreateOrder 'Confirmed' plus the transition doc comment).
    // SampleStateMachine.Apply does NOT apply here: order statuses are not
    // SampleState values (there is no SampleCollected / InAnalysis sample
    // state), so legality is enforced with this explicit transition map.
    private static readonly string[] AllowedStatuses =
        { "Confirmed", "SampleCollected", "InAnalysis", "AwaitingSignoff", "Released" };

    private static readonly Dictionary<string, string[]> AllowedTransitions = new(StringComparer.OrdinalIgnoreCase)
    {
        ["Confirmed"] = new[] { "SampleCollected" },
        ["SampleCollected"] = new[] { "InAnalysis" },
        ["InAnalysis"] = new[] { "AwaitingSignoff" },
        ["AwaitingSignoff"] = new[] { "Released" },
        ["Released"] = Array.Empty<string>()
    };

    /// <summary>
    /// Transitions a lab order through clinical workflow states.
    /// States: Confirmed -> SampleCollected -> InAnalysis -> AwaitingSignoff -> Released.
    /// Unknown orders return 404 and arbitrary status strings are rejected
    /// (422); only the legal next status for the current status is accepted
    /// (409 otherwise). Staff only.
    /// </summary>
    [HttpPost("orders/{orderId}/transition")]
    [Authorize(Policy = "StaffOnly")]
    public async Task<IActionResult> TransitionOrder(string orderId, [FromBody] System.Text.Json.JsonElement payload)
    {
        if (payload.ValueKind is System.Text.Json.JsonValueKind.Undefined or System.Text.Json.JsonValueKind.Null)
            return BadRequest(new { error = "Request body is required." });
        if (!payload.TryGetProperty("transition", out var t) || t.ValueKind != System.Text.Json.JsonValueKind.String
            || string.IsNullOrWhiteSpace(t.GetString()))
            return BadRequest(new { error = "transition (string) is required." });
        string transition = t.GetString()!;

        if (!AllowedStatuses.Contains(transition, StringComparer.OrdinalIgnoreCase))
            return StatusCode(422, new { error = $"Unknown order status '{transition}'. Allowed: {string.Join(", ", AllowedStatuses)}." });

        var order = await _db.LabOrders.FirstOrDefaultAsync(o => o.OrderId == orderId);
        if (order == null)
            return NotFound(new { error = $"Order {orderId} not found." });

        if (!AllowedTransitions.TryGetValue(order.Status, out var legal)
            || !legal.Contains(transition, StringComparer.OrdinalIgnoreCase))
            return StatusCode(409, new { error = $"INVALID_TRANSITION: order in status '{order.Status}' cannot move to '{transition}'." });

        order.Status = transition;
        order.UpdatedAtUtc = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        _logger.LogInformation("Partner portal transitioned order {OrderId} to {Transition}", orderId, transition);

        return Ok(new
        {
            success = true,
            orderId = orderId,
            state = transition,
            updatedAt = DateTime.UtcNow.ToString("o")
        });
    }

    /// <summary>
    /// Submits partner clinic accreditation and licensing application for onboarding to the Penancia network (#20).
    /// The application IS persisted with its id: there is no separate
    /// application table/entity in the Data model, so the application maps
    /// to a PartnerClinicEntity row with IsActive=false (Pending). The
    /// returned applicationId IS the stored ClinicId — no unstored id is
    /// ever returned. All fields are required: no fabricated defaults
    /// ('Partner Clinic', 'MOHAP-DHA-PENDING', 'lab@partner.ae',
    /// '+97140000000', 'Dubai, UAE') are substituted.
    /// </summary>
    [HttpPost("applications")]
    public async Task<IActionResult> SubmitApplication([FromBody] PartnerApplicationDto? dto)
    {
        if (dto is null)
            return BadRequest(new { error = "Request body is required." });
        if (string.IsNullOrWhiteSpace(dto.ClinicName) || string.IsNullOrWhiteSpace(dto.LicenseNumber)
            || string.IsNullOrWhiteSpace(dto.ContactEmail) || string.IsNullOrWhiteSpace(dto.Phone)
            || string.IsNullOrWhiteSpace(dto.Address))
            return BadRequest(new { error = "ClinicName, LicenseNumber, ContactEmail, Phone and Address are all required." });

        var clinic = new PartnerClinicEntity
        {
            ClinicId = $"cln_{Guid.NewGuid():N}".Substring(0, 12),
            Name = dto.ClinicName,
            LicenseNumber = dto.LicenseNumber,
            ContactEmail = dto.ContactEmail,
            Phone = dto.Phone,
            Address = dto.Address,
            IsActive = false // requires clinical director approval
        };

        await _db.PartnerClinics.AddAsync(clinic);
        await _db.SaveChangesAsync();

        _logger.LogInformation("Submitted clinic partnership application {ApplicationId} for {ClinicName}", clinic.ClinicId, clinic.Name);

        return Ok(new
        {
            applicationId = clinic.ClinicId,
            clinicId = clinic.ClinicId,
            status = "PendingReview",
            message = "Application received. Our clinical director will verify UAE DHA/MOHAP credentials within 2 business days."
        });
    }

    /// <summary>
    /// Retrieves active orders assigned to the partner clinic portal for lab technician tracking.
    /// No seeded fallback orders (#4): when nothing is stored, an empty
    /// list is returned. Staff only.
    /// </summary>
    [HttpGet("orders")]
    [Authorize(Policy = "StaffOnly")]
    public async Task<IActionResult> GetPartnerOrders([FromQuery] string? clinicId)
    {
        var query = _db.LabOrders.AsQueryable();
        if (!string.IsNullOrEmpty(clinicId))
        {
            query = query.Where(o => o.ClinicId == clinicId);
        }

        var orders = await query.OrderByDescending(o => o.CreatedAtUtc).Take(20).ToListAsync();

        return Ok(orders);
    }
}

public class PartnerApplicationDto
{
    public string? ClinicName { get; set; }
    public string? LicenseNumber { get; set; }
    public string? ContactEmail { get; set; }
    public string? Phone { get; set; }
    public string? Address { get; set; }
}
