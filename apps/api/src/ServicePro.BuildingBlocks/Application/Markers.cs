namespace ServicePro.BuildingBlocks.Application;

/// <summary>
/// Marks an application use case (one per command/query). Use cases are registered
/// automatically and injected into endpoints; they own one job each (SRP).
/// </summary>
public interface IUseCase;
