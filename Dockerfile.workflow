FROM mcr.microsoft.com/dotnet/sdk:8.0 AS publish
WORKDIR /source
COPY src/Penancia.S.Domain/ src/Penancia.S.Domain/
COPY src/Penancia.S.Data/ src/Penancia.S.Data/
COPY src/Penancia.S.Workflow/ src/Penancia.S.Workflow/
RUN dotnet publish src/Penancia.S.Workflow/Penancia.S.Workflow.csproj -c Release -o /home/site/wwwroot

FROM mcr.microsoft.com/azure-functions/dotnet-isolated:4-dotnet-isolated8.0
ENV AzureWebJobsScriptRoot=/home/site/wwwroot \
    AzureFunctionsJobHost__Logging__Console__IsEnabled=true \
    FUNCTIONS_WORKER_RUNTIME=dotnet-isolated
COPY --from=publish /home/site/wwwroot /home/site/wwwroot
EXPOSE 80
