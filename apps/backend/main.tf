resource "azurerm_resource_group" "honebill-rg" {
  name     = "honebill-terraform"
  location = "australiaeast"
}

resource "azurerm_container_registry" "honebill-acr" {
  name                = "honebillcontainerreg"
  resource_group_name = azurerm_resource_group.honebill-rg.name
  location            = azurerm_resource_group.honebill-rg.location
  sku                 = "Standard"
}

resource "azurerm_log_analytics_workspace" "honebill-log" {
  name                = "honebill-analytics"
  location            = azurerm_resource_group.honebill-rg.location
  resource_group_name = azurerm_resource_group.honebill-rg.name
  sku                 = "PerGB2018"
  retention_in_days   = 30
}

resource "azurerm_container_app_environment" "honebill-env" {
  name                       = "honebill-environment"
  location                   = azurerm_resource_group.honebill-rg.location
  resource_group_name        = azurerm_resource_group.honebill-rg.name
  log_analytics_workspace_id = azurerm_log_analytics_workspace.honebill-log.id
}

resource "azurerm_container_app" "honebill-aca" {
  name                         = "honebill-container"
  container_app_environment_id = azurerm_container_app_environment.honebill-env.id
  resource_group_name          = azurerm_resource_group.honebill-rg.name
  revision_mode                = "Single"

  template {
    container {
      name   = "honebill-backend"
      image  = "honebillcontainerreg.azurecr.io/honebill/honebill-api:v1.0.1"
      cpu    = 0.25
      memory = "0.5Gi"
    }
  }
  
  ingress {
    external_enabled=true
    target_port=3001
    traffic_weight {
      percentage=80
    }
  }
}