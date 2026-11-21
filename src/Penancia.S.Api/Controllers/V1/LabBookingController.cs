using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Penancia.S.Data;
using Penancia.S.Data.Entities;

namespace Penancia.S.Api.Controllers.V1;

/// <summary>
/// Controller for Clinical Lab Booking, partner quotes, slot reservations, and order tracking.
/// Handles accredited Dubai/UAE andrology clinic quotes and sample collection bookings.
/// </summary>
[ApiController]
[Route("v1")]
[Authorize]
public class LabBookingController : ControllerBase
{
    private readonly PenanciaDbContext _db;
    private readonly ILogger<LabBookingController> _logger;

    public LabBookingController(PenanciaDbContext db, ILogger<LabBookingController> logger)
    {
        _db = db;
        _logger = logger;
    }

    /// <summary>
    /// Generates quotes from STORED partner clinics only (#4, #20). The
    /// seeded Dubai clinic quotes (walk-in 350/450/300, home 550/700/500)
    /// are DELETED: they were invented prices for invented clinics and they
    /// did not map unambiguously onto the order charges, so they cannot be
    /// the price source. When no clinic is stored, an empty quote list is
    /// returned. No slot time is advertised: no Slots table exists, so
    /// availability comes only from a real slot hold (see HoldSlot).
    /// </summary>
    [HttpPost("quotes")]
    public async Task<IActionResult> GetQuotes([FromBody] System.Text.Json.JsonElement payload)
    {
        if (payload.ValueKind is System.Text.Json.JsonValueKind.Undefined or System.Text.Json.JsonValueKind.Null)
            return BadRequest(new { error = "Request body is required." });

        var clinics = await _db.PartnerClinics.Where(c => c.IsActive).ToListAsync();

        var results = clinics.Select(c => new
        {
            id = c.ClinicId,
            clinicName = c.Name,
            city = c.City,
            walkInPriceAed = c.WalkInPriceAed,
            homeCollectionPriceAed = c.HomeCollectionPriceAed,
            accreditation = "Accredited UAE Partner"
        });

        return Ok(new { quotes = results, currency = "AED" });
    }

    /// <summary>
    /// Creates a 15-minute temporary slot hold to guarantee appointment availability during booking.
    /// The clinic must exist (no fabricated 'cln_dxb_01' default, #20).
    /// A second hold on the same slot is rejected (409): SlotId is unique
    /// (IX_SlotHolds_SlotId).
    /// </summary>
    [HttpPost("slots/{slotId}/hold")]
    public async Task<IActionResult> HoldSlot(string slotId, [FromQuery] string? clinicId)
    {
        if (string.IsNullOrWhiteSpace(clinicId))
            return BadRequest(new { error = "clinicId is required." });
        var clinic = await _db.PartnerClinics.FirstOrDefaultAsync(c => c.ClinicId == clinicId);
        if (clinic == null)
            return NotFound(new { error = $"Clinic {clinicId} not found." });

        string holdId = $"hld_{Guid.NewGuid():N}".Substring(0, 16);
        var hold = new SlotHoldEntity
        {
            HoldId = holdId,
            SlotId = slotId,
            ClinicId = clinicId,
            CreatedAtUtc = DateTime.UtcNow,
            ExpiresAtUtc = DateTime.UtcNow.AddMinutes(15),
            IsClaimed = false
        };

        try
        {
            await _db.SlotHolds.AddAsync(hold);
            await _db.SaveChangesAsync();
        }
        catch (DbUpdateException)
        {
            return StatusCode(409, new { error = $"Slot {slotId} already has an active hold." });
        }

        _logger.LogInformation("Held slot {SlotId} under holdId {HoldId} with 15-minute TTL", slotId, holdId);

        return Ok(new
        {
            holdId = hold.HoldId,
            slotId = hold.SlotId,
            expiresAtUtc = hold.ExpiresAtUtc.ToString("o"),
            ttlSeconds = 900
        });
    }

    /// <summary>
    /// Confirms a lab order, converts slot hold, and generates tracking credentials (#20).
    /// - ClinicId is required and the clinic must exist (404 otherwise).
    /// - SlotHoldId, when supplied, is validated server-side: the hold must
    ///   exist (404), must not be expired (SlotHoldEntity.ExpiresAtUtc is
    ///   enforced — 409 when expired) and must not already be claimed (409);
    ///   a valid hold is marked claimed. An order may still be created
    ///   without a hold (SlotHoldId is optional on LabOrderEntity).
    /// - ONE price source: the price is read from the STORED clinic row
    ///   (WalkInPriceAed / HomeCollectionPriceAed) for the requested
    ///   collection type. The old flat hardcoded order charges (650 home /
    ///   400 walk-in) are removed from this controller; the amounts survive
    ///   only as the entity column defaults on PartnerClinicEntity, which is
    ///   the remaining ambiguity — see the fix report: whether the flat
    ///   400/650 defaults are real per-clinic prices still needs confirming
    ///   with the labs, and the seed quotes (550/700/500) were deleted
    ///   because they mapped to no clinic unambiguously.
    /// - Tracking numbers are GUID-based, never new Random().
    /// </summary>
    [HttpPost("orders")]
    public async Task<IActionResult> CreateOrder([FromBody] CreateOrderRequest? request)
    {
        if (request is null)
            return BadRequest(new { error = "Request body is required." });
        if (string.IsNullOrWhiteSpace(request.ClinicId))
            return BadRequest(new { error = "ClinicId is required." });
        if (request.CollectionType is not ("home" or "walk-in"))
            return StatusCode(422, new { error = "CollectionType must be 'home' or 'walk-in'." });

        var clinic = await _db.PartnerClinics.FirstOrDefaultAsync(c => c.ClinicId == request.ClinicId);
        if (clinic == null)
            return NotFound(new { error = $"Clinic {request.ClinicId} not found." });

        SlotHoldEntity? hold = null;
        if (!string.IsNullOrWhiteSpace(request.SlotId))
        {
            hold = await _db.SlotHolds.FirstOrDefaultAsync(h => h.HoldId == request.SlotId);
            if (hold == null)
                return NotFound(new { error = $"Slot hold {request.SlotId} not found." });
            if (hold.ExpiresAtUtc <= DateTime.UtcNow)
                return StatusCode(409, new { error = $"Slot hold {request.SlotId} expired at {hold.ExpiresAtUtc:o}." });
            if (hold.IsClaimed)
                return StatusCode(409, new { error = $"Slot hold {request.SlotId} has already been claimed." });
        }

        string orderId = $"ord_{Guid.NewGuid():N}".Substring(0, 16);
        string trackingNumber = $"TRK-{Guid.NewGuid():N}";

        var order = new LabOrderEntity
        {
            OrderId = orderId,
            TrackingNumber = trackingNumber,
            ClinicId = request.ClinicId,
            PatientId = User.FindFirst("preferred_username")?.Value ?? User.Identity?.Name ?? "Unknown",
            CollectionType = request.CollectionType,
            Status = "Confirmed",
            PriceAed = request.CollectionType == "home" ? clinic.HomeCollectionPriceAed : clinic.WalkInPriceAed,
            SlotHoldId = request.SlotId,
            CreatedAtUtc = DateTime.UtcNow,
            Notes = request.Notes
        };

        if (hold != null)
            hold.IsClaimed = true;

        await _db.LabOrders.AddAsync(order);
        await _db.SaveChangesAsync();

        _logger.LogInformation("Created lab order {OrderId} with tracking {TrackingNumber}", orderId, trackingNumber);

        return Ok(new
        {
            orderId = order.OrderId,
            trackingNumber = order.TrackingNumber,
            status = order.Status,
            priceAed = order.PriceAed,
            currency = "AED",
            createdAt = order.CreatedAtUtc.ToString("o")
        });
    }
}

public class CreateOrderRequest
{
    public string? SlotId { get; set; }
    public string? ClinicId { get; set; }
    public string? PatientId { get; set; }
    public string? CollectionType { get; set; }
    public string? Notes { get; set; }
}
