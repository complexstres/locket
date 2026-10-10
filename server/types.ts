export type VaultEntry = {
  id: string
  title: string
  username: string
  password: string
  url: string
  notes: string
  category: string
  favorite: boolean
  emailAccountId?: string
  createdAt: string
  updatedAt: string
}

export type EmailAccount = {
  id: string
  label: string
  email: string
  imapHost: string
  imapPort: number
  imapSecure: boolean
  password: string
  createdAt: string
}

export type SshKey = {
  id: string
  label: string
  type: 'ed25519' | 'rsa' | 'ecdsa'
  comment: string
  publicKey: string
  privateKey: string
  fingerprint: string
  passphraseProtected: boolean
  createdAt: string
}

export type TotpEntry = {
  id: string
  label: string
  issuer: string
  secret: string
  digits: number
  period: number
  algorithm: 'SHA1' | 'SHA256' | 'SHA512'
  createdAt: string
}

export type SecureNote = {
  id: string
  title: string
  body: string
  tags: string[]
  favorite: boolean
  createdAt: string
  updatedAt: string
}

export type VaultData = {
  entries: VaultEntry[]
  accounts: EmailAccount[]
  sshKeys: SshKey[]
  totp: TotpEntry[]
  notes: SecureNote[]
}

export type MetaFile = {
  salt: string
  verifier: string
  createdAt: string
}

export function emptyVault(): VaultData {
  return { entries: [], accounts: [], sshKeys: [], totp: [], notes: [] }
}

export function normalizeVault(data: Partial<VaultData>): VaultData {
  return {
    entries: data.entries ?? [],
    accounts: data.accounts ?? [],
    sshKeys: data.sshKeys ?? [],
    totp: data.totp ?? [],
    notes: data.notes ?? [],
  }
}
