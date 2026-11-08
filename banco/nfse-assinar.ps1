# Fala com a Sefin Nacional usando o certificado instalado no Windows (a senha do .pfx nao e usada).
# Chamado pelo banco/nfse-local.js: recebe JSON na entrada e devolve JSON na saida.
# Entrada: { "cnpj", "ambiente": "restrita"|"producao", "metodo": "POST"|"GET", "caminho": "/nfse", "id": "DPS...", "xml": "..." }
# Saida:   { "status": 201, "corpo": "..." } ou { "falha": "motivo" }
# O envio so sai se o tpAmb do XML for o do ambiente pedido: nota de teste nunca vai para producao, nem o contrario.
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
Add-Type -AssemblyName System.Security

$BASES = @{
  restrita = @{ url = 'https://sefin.producaorestrita.nfse.gov.br/API/SefinNacional'; tpAmb = '<tpAmb>2</tpAmb>' }
  producao = @{ url = 'https://sefin.nfse.gov.br/SefinNacional'; tpAmb = '<tpAmb>1</tpAmb>' }
}

function Responder($obj) {
  $b = (New-Object Text.UTF8Encoding $false).GetBytes(($obj | ConvertTo-Json -Compress -Depth 3))
  $s = [Console]::OpenStandardOutput(); $s.Write($b, 0, $b.Length); $s.Flush()
}

function Assinar($xml, $id, $cert) {
  $doc = New-Object Xml.XmlDocument; $doc.PreserveWhitespace = $true; $doc.LoadXml($xml)
  $sx = New-Object Security.Cryptography.Xml.SignedXml($doc)
  $sx.SigningKey = [Security.Cryptography.X509Certificates.RSACertificateExtensions]::GetRSAPrivateKey($cert)
  $sx.SignedInfo.SignatureMethod = 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256'
  $sx.SignedInfo.CanonicalizationMethod = 'http://www.w3.org/2001/10/xml-exc-c14n#WithComments'
  $ref = New-Object Security.Cryptography.Xml.Reference('#' + $id)
  $ref.DigestMethod = 'http://www.w3.org/2001/04/xmlenc#sha256'
  $ref.AddTransform((New-Object Security.Cryptography.Xml.XmlDsigEnvelopedSignatureTransform)) | Out-Null
  $ref.AddTransform((New-Object Security.Cryptography.Xml.XmlDsigExcC14NTransform($true))) | Out-Null
  $sx.AddReference($ref)
  $ki = New-Object Security.Cryptography.Xml.KeyInfo
  $ki.AddClause((New-Object Security.Cryptography.Xml.KeyInfoX509Data($cert, [Security.Cryptography.X509Certificates.X509IncludeOption]::EndCertOnly)))
  $sx.KeyInfo = $ki
  $sx.ComputeSignature()
  $doc.DocumentElement.AppendChild($doc.ImportNode($sx.GetXml(), $true)) | Out-Null
  return $doc.OuterXml
}

function Compactar($texto) {
  $ms = New-Object IO.MemoryStream
  $gz = New-Object IO.Compression.GzipStream($ms, [IO.Compression.CompressionMode]::Compress, $true)
  $b = [Text.Encoding]::UTF8.GetBytes($texto); $gz.Write($b, 0, $b.Length); $gz.Close()
  return [Convert]::ToBase64String($ms.ToArray())
}

try {
  $leitor = New-Object IO.StreamReader([Console]::OpenStandardInput(), (New-Object Text.UTF8Encoding $false))
  $p = $leitor.ReadToEnd() | ConvertFrom-Json
  if ($p.cnpj -notmatch '^\d{14}$') { throw 'CNPJ invalido na configuracao' }
  if ($p.caminho -notmatch '^/(nfse|dps)(/[A-Za-z0-9]+)?$') { throw 'caminho nao permitido' }
  if (@('restrita', 'producao') -cnotcontains $p.ambiente) { throw 'ambiente desconhecido' }
  $amb = $BASES[[string]$p.ambiente]

  $cert = Get-ChildItem Cert:\CurrentUser\My | Where-Object { $_.Subject -like "*$($p.cnpj)*" -and $_.HasPrivateKey -and $_.NotAfter -gt (Get-Date) } |
    Sort-Object NotAfter -Descending | Select-Object -First 1
  if (-not $cert) { throw 'certificado da empresa nao encontrado ou vencido' }

  $req = [Net.HttpWebRequest]::Create($amb.url + $p.caminho)
  $req.Method = $p.metodo; $req.Timeout = 60000; $req.Accept = 'application/json'
  $req.ClientCertificates.Add($cert) | Out-Null

  if ($p.metodo -eq 'POST') {
    if (-not $p.xml.Contains($amb.tpAmb)) { throw 'o XML nao e deste ambiente' }
    $corpo = '{"dpsXmlGZipB64":"' + (Compactar (Assinar $p.xml $p.id $cert)) + '"}'
    $bytes = [Text.Encoding]::UTF8.GetBytes($corpo)
    $req.ContentType = 'application/json'; $req.ContentLength = $bytes.Length
    $s = $req.GetRequestStream(); $s.Write($bytes, 0, $bytes.Length); $s.Close()
  }

  try { $resp = $req.GetResponse() }
  catch [Net.WebException] {
    $resp = $_.Exception.Response
    if (-not $resp) { throw $_.Exception.Message }
  }
  $texto = (New-Object IO.StreamReader($resp.GetResponseStream(), [Text.Encoding]::UTF8)).ReadToEnd()
  Responder @{ status = [int]$resp.StatusCode; corpo = $texto }
} catch {
  Responder @{ falha = [string]$_.Exception.Message }
}
