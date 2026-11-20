
output "backend_public_ip" {
  description = "HoneBill backend static IP"
  value       = aws_lightsail_static_ip.backend.ip_address
}

output "caddy_public_ip" {
  description = "HoneBill Caddy static IP"
  value       = aws_lightsail_static_ip.caddy.ip_address
}

output "backend_ssh_command" {
  value = "ssh -i ~/.ssh/id_ed25519 ec2-user@${aws_lightsail_static_ip.backend.ip_address}"
}

output "caddy_ssh_command" {
  value = "ssh -i ~/.ssh/id_ed25519 ec2-user@${aws_lightsail_static_ip.caddy.ip_address}"
}

# Output the Secrets Manager ARN so you can retrieve the generated password
output "rds_master_user_secret_arn" {
  value = aws_db_instance.honebill_rds.master_user_secret[0].secret_arn
}