import { execFile } from 'node:child_process'
import { createHash, generateKeyPairSync, randomBytes } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export type SshType = 'ed25519' | 'rsa' | 'ecdsa'

export async function generateSshKey(opts: {
  type?: SshType
  comment?: string
  passphrase?: string
}): Promise<{
  type: SshType
  publicKey: string
  privateKey: string
  fingerprint: string
  comment: string
  passphraseProtected: boolean
}> {
  const type: SshType = opts.type || 'ed25519'
  const comment = (opts.comment || 'locket@local').trim()
  const passphrase = opts.passphrase || ''

  try {
    return await viaSshKeygen(type, comment, passphrase)
  } catch {
    return viaNodeCrypto(type, comment, passphrase)
  }
}

async function viaSshKeygen(type: SshType, comment: string, passphrase: string) {
  const dir = mkdtempSync(join(tmpdir(), 'locket-ssh-'))
  const keyPath = join(dir, 'id_key')
  try {
    const args = ['-t', type, '-C', comment, '-f', keyPath, '-N', passphrase, '-q']
    if (type === 'rsa') args.push('-b', '4096')
    if (type === 'ecdsa') args.push('-b', '521')
    await execFileAsync('ssh-keygen', args)
    const publicKey = readFileSync(`${keyPath}.pub`, 'utf8').trim()
    const privateKey = readFileSync(keyPath, 'utf8')
    const { stdout } = await execFileAsync('ssh-keygen', ['-lf', `${keyPath}.pub`])
    const fingerprint = stdout.trim().split(/\s+/)[1] || fingerprintOf(publicKey)
    return {
      type,
      publicKey,
      privateKey,
      fingerprint,
      comment,
      passphraseProtected: Boolean(passphrase),
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

function viaNodeCrypto(type: SshType, comment: string, passphrase: string) {
  let publicKey: string
  let privateKey: string

  if (type === 'rsa') {
    const pair = generateKeyPairSync('rsa', {
      modulusLength: 4096,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: passphrase
        ? { type: 'pkcs8', format: 'pem', cipher: 'aes-256-cbc', passphrase }
        : { type: 'pkcs8', format: 'pem' },
    })
    publicKey = pair.publicKey
    privateKey = pair.privateKey
  } else if (type === 'ecdsa') {
    const pair = generateKeyPairSync('ec', {
      namedCurve: 'secp521r1',
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: passphrase
        ? { type: 'pkcs8', format: 'pem', cipher: 'aes-256-cbc', passphrase }
        : { type: 'pkcs8', format: 'pem' },
    })
    publicKey = pair.publicKey
    privateKey = pair.privateKey
  } else {
    const pair = generateKeyPairSync('ed25519', {
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: passphrase
        ? { type: 'pkcs8', format: 'pem', cipher: 'aes-256-cbc', passphrase }
        : { type: 'pkcs8', format: 'pem' },
    })
    publicKey = pair.publicKey
    privateKey = pair.privateKey
  }

  return {
    type,
    publicKey: `${publicKey.trim()}\n# ${comment}`,
    privateKey,
    fingerprint: fingerprintOf(publicKey + randomBytes(0).toString()),
    comment,
    passphraseProtected: Boolean(passphrase),
  }
}

function fingerprintOf(material: string): string {
  const hash = createHash('sha256').update(material).digest('base64').replace(/=+$/, '')
  return `SHA256:${hash}`
}
