// Second-stage Container Apps Easy Auth configuration. Pass the web FQDN from
// main.bicep's webContainerAppFqdn output, without the https:// prefix.
targetScope = 'resourceGroup'

param webAppName string = 'penancias-web'
param webFqdn string
param entraTenantId string = tenant().tenantId
param entraWebClientId string

resource web 'Microsoft.App/containerApps@2024-03-01' existing = {
  name: webAppName
}

resource webAuth 'Microsoft.App/containerApps/authConfigs@2024-03-01' = {
  parent: web
  name: 'current'
  properties: {
    platform: {
      enabled: true
      runtimeVersion: '~1'
    }
    globalValidation: {
      unauthenticatedClientAction: 'RedirectToLoginPage'
      redirectToProvider: 'azureactivedirectory'
      excludedPaths: [
        '/health'
      ]
    }
    identityProviders: {
      azureActiveDirectory: {
        enabled: true
        registration: {
          openIdIssuer: '${environment().authentication.loginEndpoint}${entraTenantId}/v2.0'
          clientId: entraWebClientId
          clientSecretSettingName: 'entra-web-client-secret'
        }
        validation: {
          allowedAudiences: [
            entraWebClientId
          ]
          defaultAuthorizationPolicy: {
            allowedPrincipals: {}
          }
        }
        login: {
          disableWWWAuthenticate: false
          loginParameters: [
            'response_type=code id_token'
          ]
        }
      }
    }
    login: {
      tokenStore: {
        enabled: true
      }
      preserveUrlFragmentsForLogins: false
      allowedExternalRedirectUrls: [
        'https://${webFqdn}/.auth/login/aad/callback'
      ]
      cookieExpiration: {
        convention: 'FixedTime'
        timeToExpiration: '08:00:00'
      }
      nonce: {
        validateNonce: true
        nonceExpirationInterval: '00:05:00'
      }
    }
    httpSettings: {
      requireHttps: true
      routes: {
        apiPrefix: '/.auth'
      }
      forwardProxy: {
        convention: 'Custom'
        customHostHeaderName: 'X-Forwarded-Host'
        customProtoHeaderName: 'X-Forwarded-Proto'
      }
    }
  }
}
