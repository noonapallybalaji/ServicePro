# ServicePro API container (used by Render; works on any Docker host).
# Build context: apps/api   →   docker build -t servicepro-api apps/api

FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY . .
# OpenAPI is generated during local builds only; the image doesn't need it.
RUN dotnet publish src/ServicePro.Api/ServicePro.Api.csproj -c Release -o /app \
    --packages /nuget -p:OpenApiGenerateDocuments=false

FROM mcr.microsoft.com/dotnet/aspnet:10.0
# Fonts for the bill PDFs (QuestPDF).
RUN apt-get update \
    && apt-get install -y --no-install-recommends fontconfig fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /app .
ENV ASPNETCORE_HTTP_PORTS=8080 \
    ASPNETCORE_ENVIRONMENT=Public \
    Storage__Local__RootPath=/tmp/servicepro-storage
EXPOSE 8080
USER $APP_UID
ENTRYPOINT ["dotnet", "ServicePro.Api.dll"]
