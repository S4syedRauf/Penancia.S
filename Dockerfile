FROM mcr.microsoft.com/dotnet/sdk:8.0-alpine AS build
WORKDIR /source

# Copy solution and project files
COPY Penancia.S.sln .
COPY src/Penancia.S.Domain/Penancia.S.Domain.csproj src/Penancia.S.Domain/
COPY src/Penancia.S.Data/Penancia.S.Data.csproj src/Penancia.S.Data/
COPY src/Penancia.S.Api/Penancia.S.Api.csproj src/Penancia.S.Api/
COPY src/Penancia.S.Workflow/Penancia.S.Workflow.csproj src/Penancia.S.Workflow/
COPY tests/Penancia.S.Tests/Penancia.S.Tests.csproj tests/Penancia.S.Tests/

# Copy all source code
COPY src/ src/
COPY tests/ tests/

# Publish Api for production Release
RUN dotnet publish src/Penancia.S.Api/Penancia.S.Api.csproj -c Release -o /app/publish

FROM mcr.microsoft.com/dotnet/aspnet:8.0-alpine AS runtime
# Install ICU libraries required by Microsoft.Data.SqlClient on Alpine Linux
RUN apk add --no-cache icu-libs
ENV DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=false

WORKDIR /app
COPY --from=build /app/publish .

ENV ASPNETCORE_URLS=http://+:8080
ENV ASPNETCORE_ENVIRONMENT=Production
EXPOSE 8080

ENTRYPOINT ["dotnet", "Penancia.S.Api.dll"]
