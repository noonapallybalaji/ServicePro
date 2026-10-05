using System.Reflection;
using NetArchTest.Rules;
using ServicePro.Infrastructure;

namespace ServicePro.ArchitectureTests;

/// <summary>Enforces ADR 0001: modules talk only through ServicePro.Contracts.</summary>
public sealed class ModuleBoundaryTests
{
    private const string ModulePrefix = "ServicePro.Modules.";

    public static TheoryData<string> Modules()
    {
        var data = new TheoryData<string>();
        foreach (var module in ModuleCatalog.All)
        {
            data.Add(module.Assembly.GetName().Name!);
        }

        return data;
    }

    private static Assembly Load(string name) => ModuleCatalog.All.Select(m => m.Assembly).Single(a => a.GetName().Name == name);

    [Theory]
    [MemberData(nameof(Modules))]
    public void A_module_does_not_reference_any_other_module(string moduleName)
    {
        var others = ModuleCatalog.All
            .Select(m => m.Assembly.GetName().Name!)
            .Where(n => n != moduleName)
            .ToArray();

        var result = Types.InAssembly(Load(moduleName))
            .ShouldNot()
            .HaveDependencyOnAny(others)
            .GetResult();

        result.IsSuccessful.ShouldBeTrue($"{moduleName} depends on another module: {string.Join(", ", result.FailingTypeNames ?? [])}");
    }

    [Fact]
    public void Shared_projects_never_depend_on_modules()
    {
        foreach (var assembly in new[] { typeof(SharedKernel.Results.Result).Assembly, typeof(Contracts.ServiceRequestStatus).Assembly, typeof(BuildingBlocks.DependencyInjection).Assembly })
        {
            var result = Types.InAssembly(assembly).ShouldNot().HaveDependencyOnAny(ModulePrefix).GetResult();
            result.IsSuccessful.ShouldBeTrue($"{assembly.GetName().Name} depends on a module: {string.Join(", ", result.FailingTypeNames ?? [])}");
        }
    }

    [Fact]
    public void Shared_kernel_is_free_of_frameworks()
    {
        var result = Types.InAssembly(typeof(SharedKernel.Results.Result).Assembly)
            .ShouldNot()
            .HaveDependencyOnAny("Microsoft.EntityFrameworkCore", "Microsoft.AspNetCore")
            .GetResult();

        result.IsSuccessful.ShouldBeTrue();
    }

    [Theory]
    [MemberData(nameof(Modules))]
    public void Modules_use_the_base_DbContext_not_the_composed_one(string moduleName)
    {
        var result = Types.InAssembly(Load(moduleName))
            .ShouldNot()
            .HaveDependencyOn("ServicePro.Infrastructure")
            .GetResult();

        result.IsSuccessful.ShouldBeTrue();
    }

    [Theory]
    [MemberData(nameof(Modules))]
    public void Domain_does_not_depend_on_web_concerns(string moduleName)
    {
        var result = Types.InAssembly(Load(moduleName))
            .That().ResideInNamespaceContaining(".Domain")
            .ShouldNot()
            .HaveDependencyOnAny("Microsoft.AspNetCore", "Microsoft.EntityFrameworkCore")
            .GetResult();

        result.IsSuccessful.ShouldBeTrue($"{moduleName} domain leaks framework types: {string.Join(", ", result.FailingTypeNames ?? [])}");
    }
}
