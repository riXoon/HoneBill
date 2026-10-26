param(
  [string]$Legacy = 'http://localhost:3001/api',
  [string]$Nest   = 'http://localhost:3000/api'
)

function Hit($base, $method, $path, $body) {
  $uri = "$base$path"
  $status = 'ERR'; $text = ''
  try {
    $args = @{ Uri = $uri; Method = $method; UseBasicParsing = $true }
    if ($body) { $args.ContentType = 'application/json'; $args.Body = $body }
    $r = Invoke-WebRequest @args
    $status = [int]$r.StatusCode; $text = $r.Content
  } catch {
    if ($_.Exception.Response) { $status = [int]$_.Exception.Response.StatusCode }
    if ($_.ErrorDetails -and $_.ErrorDetails.Message) { $text = $_.ErrorDetails.Message }
    else {
      try { $text = (New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())).ReadToEnd() } catch { $text = $_.Exception.Message }
    }
  }
  $keys = try { (($text | ConvertFrom-Json).PSObject.Properties.Name | Sort-Object) -join ',' } catch { '<non-json>' }
  [pscustomobject]@{ Status = $status; Keys = $keys }
}

# A syntactically valid Stellar public key (random, never funded)
$acct = (node -e "console.log(require('@stellar/stellar-sdk').Keypair.random().publicKey())").Trim()

$cases = @(
  @{ Name='GET auth, no account';        M='GET';  P='/auth';                          B=$null },
  @{ Name='GET auth, invalid account';   M='GET';  P='/auth?account=GABC';             B=$null },
  @{ Name='GET auth, valid account';     M='GET';  P="/auth?account=$acct";            B=$null },
  @{ Name='GET auth, non-numeric memo';  M='GET';  P="/auth?account=$acct&memo=abc";   B=$null },
  @{ Name='POST auth, empty body';       M='POST'; P='/auth';                          B='{}' },
  @{ Name='POST auth, garbage tx';       M='POST'; P='/auth';                          B='{"transaction":"garbage"}' },
  @{ Name='POST pin/verify, empty';      M='POST'; P='/auth/pin/verify';               B='{}' },
  @{ Name='POST otp/send, empty';        M='POST'; P='/otp/send';                      B='{}' },
  @{ Name='POST otp/send, bad phone';    M='POST'; P='/otp/send';                      B='{"phoneNumber":"not-a-phone"}' },
  @{ Name='POST otp/verify, empty';      M='POST'; P='/otp/verify';                    B='{}' },
  @{ Name='POST register, empty';        M='POST'; P='/register';                      B='{}' },
  @{ Name='GET users/check, no phone';   M='GET';  P='/users/check';                   B=$null },
  @{ Name='GET users/lookup, no params'; M='GET';  P='/users/lookup';                  B=$null },
  @{ Name='GET users/lookup, unknown';   M='GET';  P='/users/lookup?shortId=ZZZZZZ';   B=$null }
)

$rows = foreach ($c in $cases) {
  $l = Hit $Legacy $c.M $c.P $c.B
  $n = Hit $Nest   $c.M $c.P $c.B
  [pscustomobject]@{
    Case = $c.Name; LegacyStatus = $l.Status; NestStatus = $n.Status
    LegacyKeys = $l.Keys; NestKeys = $n.Keys
    Match = if ($l.Status -eq $n.Status -and $l.Keys -eq $n.Keys) { 'OK' } else { 'DIFF' }
  }
}
$rows | Format-Table -AutoSize -Wrap