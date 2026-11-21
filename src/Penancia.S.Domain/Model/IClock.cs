namespace Penancia.S.Domain.Model;

/// <summary>
/// Time is injected so orchestrator code stays deterministic and tests can fix the date.
/// </summary>
public interface IClock { DateTimeOffset UtcNow { get; } }
