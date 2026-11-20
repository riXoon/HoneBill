locals {
  name_prefix = "${var.project_name}-${var.environment}"

  common_tags = {
    Project     = var.project_name
    Environment = var.Environment
    ManagedBy   = "terraform"
  }
}

# SSH public key registration
resource "aws_lightsail_key_pair" "honebill_key_pair" {
  name       = "honebill-ssh-key"
  public_key = file(pathexpand(var.ssh_public_key_path))
}

# Backend instance
resource "aws_lightsail_instance" "backend_lightsail" {
  name              = "honebill_backend"
  availability_zone = var.az
  blueprint_id      = "amazon_linux_2023"
  bundle_id         = var.backend_bundle_id
  key_pair_name     = aws_lightsail_key_pair.lightsail_key_pair.name

  user_data = file("${path.module}/user-data/backend.sh")

  tags = locals.common_tags
}

# Caddy reverse proxy instance
resource "aws_lightsail_instance" "caddy_lightsail" {
  name              = "honebill_caddy"
  availability_zone = var.az
  blueprint_id      = "amazon_linux_2023"
  bundle_id         = var.caddy_bundle_id
  key_pair_name     = aws_lightsail_key_pair.honebill.name

  user_data = file("${path.module}/user-data/caddy.sh")

  tags = locals.common_tags
}

# RDS Custom Database
resource "aws_rds_orderable_db_instance" "custom_postgresql" {
  engine = "postgresql"
  engine_version = 18.6
}

# RDS
resource "aws_db_instance" "honebill_rds" {
  allocated_storage    = 20
  db_name              = "honebill"
  engine               = "postgres"
  engine_version       = "18.6"
  instance_class       = "db.t4g.micro" # 2vCPUs, 1GiB RAM, EBS 2085mbps
  storage_type          = "gp3" # SSD
  storage_encrypted     = true
  multi_az              = false
  availability_zone = var.az

  username             = "honebill_admin"
  manage_master_user_password = true # Stores credentials automatically in AWS Secrets Manager

  # Network access (uncomment if running pg_restore from your local machine)
  # publicly_accessible    = true
  # vpc_security_group_ids = [aws_security_group.rds_sg.id]
  # db_subnet_group_name   = aws_db_subnet_group.main.name

  parameter_group_name = "default.postgres18"
  auto_minor_version_upgrade  = true
  allow_major_version_upgrade = false
  apply_immediately           = false

  # Set to true only for temporary dev/sandbox environments
  skip_final_snapshot       = false
  final_snapshot_identifier = "honebill-postgres-final"

  lifecycle {
    # Prevents Terraform from reverting AWS-managed minor patches when auto_minor_version_upgrade = true
    ignore_changes = [engine_version]
  }

  tags = locals.common_tags
}

# Static IP for backend
resource "aws_lightsail_static_ip" "backend" {
  name = "honebill-backend-ip"
}

resource "aws_lightsail_static_ip_attachment" "backend_ip" {
  static_ip_name = aws_lightsail_static_ip.backend.name
  instance_name  = aws_lightsail_instance.backend_lightsail.name
}

# Static IP for Caddy
resource "aws_lightsail_static_ip" "caddy" {
  name = "honebill-caddy-ip"
}

resource "aws_lightsail_static_ip_attachment" "caddy_ip" {
  static_ip_name = aws_lightsail_static_ip.caddy.name
  instance_name  = aws_lightsail_instance.caddy_lightsail.name
}

# Backend Firewall
resource "aws_lightsail_instance_public_ports" "backend_firewall" {
  instance_name = aws_lightsail_instance.backend_lightsail.name

  # SSH ports, restricted to this public IP
  port_info {
    protocol  = "tcp"
    from_port = 22
    to_port   = 22
    cidrs     = [var.admin_cidr]
  }

  # NestJS API: accessible only through Caddy
  port_info {
    protocol  = "tcp"
    from_port = 3001
    to_port   = 3001
    # Allow backend to be accessible by caddy
    cidrs = ["${aws_lightsail_static_ip.caddy.ip_address}/32"]
  }
}

# Caddy firewall
resource "aws_lightsail_instance_public_ports" "caddy_firewall" {
  instance_name = aws_lightsail_instance.caddy_lightsail.name

  port_info {
    protocol  = "tcp"
    from_port = 22
    to_port   = 22
    cidrs     = [var.admin_cidr]
  }

  # HTTP
  port_info {
    protocol  = "tcp"
    from_port = 80
    to_port   = 80
    cidrs     = ["0.0.0.0/0"]
  }

  # HTTPS
  port_info {
    protocol  = "tcp"
    from_port = 443
    to_port   = 443
    cidrs     = ["0.0.0.0/0"]
  }
}