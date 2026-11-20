variable "project_name" {
  description = "Project prefix used for naming AWS resources"
  type        = string
  default     = "honebill"
}

variable "environment" {
  description = "Deployment environment (e.g., prod, staging)"
  type        = string
  default     = "dev"
}

variable "role" {
  description = "A purpose of that service that needs to be provisioned"
  type        = string
  default     = "backend"
}

variable "domain_name" {
  description = "Public API hostname that Caddy serves, e.g. api.yourdomain.com"
  type        = string
}

variable "admin_cidr" {
  description = "Own public IP for SSH, written as x.x.x.x/32"
  type        = string

  validation {
    condition     = can(cidrhost(var.admin_cidr, 0)) && endswith(var.admin_cidr, "/32")
    error_message = "admin_cidr must be a valid single-host IPv4 CIDR block ending in /32 (e.g., 203.0.113.10/32)."
  }
}

variable "ssh_public_key_path" {
  description = "Path to SSH public key"
  type        = string
  default     = "~/.ssh/id_ed25519.pub"
}

variable "az" {
  description = "AWS Availability Zone in ap-southeast-1"
  type        = string
  default     = "ap-southeast-1a"
}

variable "blueprint_id" {
  description = "Lightsail OS blueprint ID"
  type        = string
  default     = "amazon_linux_2023"
}

variable "backend_bundle_id" {
  description = "Backend instance plan (small_3_0 = 2 GB RAM, 2 vCPU, 60 GB SSD)"
  type        = string
  default     = "small_3_0"
}

variable "caddy_bundle_id" {
  description = "Caddy reverse proxy plan (nano_3_0 = 512 MB RAM, 2 vCPU, 20 GB SSD)"
  type        = string
  default     = "nano_3_0"
}