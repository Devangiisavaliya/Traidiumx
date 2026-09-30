import hashlib
import hmac
import struct
from config.database import get_database
from config.settings import settings
from utils.validators import clean_string

# Standard BIP-39 / BIP-44 TRON Derivation with pure Python / cryptography
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives import serialization

DEFAULT_DEV_HD_MNEMONIC = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about"
TRON_COIN_TYPE = 195
EVM_COIN_TYPE = 60
CURVE_ORDER = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BB5D576E7357A4501
BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"


def _to_checksum_address(raw_hex_addr: str) -> str:
    addr = raw_hex_addr.lower().replace("0x", "")
    h = _keccak_256(addr.encode("ascii")).hex()
    checksummed = ""
    for i, char in enumerate(addr):
        if int(h[i], 16) >= 8:
            checksummed += char.upper()
        else:
            checksummed += char.lower()
    return "0x" + checksummed


def _keccak_256(data: bytes) -> bytes:
    RC = [
        0x0000000000000001, 0x0000000000008082, 0x800000000000808A, 0x8000000080008000,
        0x000000000000808B, 0x0000000080000001, 0x8000000080008081, 0x8000000000008009,
        0x000000000000008A, 0x0000000000000088, 0x0000000080008009, 0x000000008000000A,
        0x000000008000808B, 0x800000000000008B, 0x8000000000008089, 0x8000000000008003,
        0x8000000000008002, 0x8000000000000080, 0x000000000000800A, 0x800000008000000A,
        0x8000000080008081, 0x8000000000008080, 0x0000000080000001, 0x8000000080008008
    ]
    r = 136
    padded = bytearray(data)
    padded.append(0x01)
    while len(padded) % r != (r - 1):
        padded.append(0x00)
    padded.append(0x80)
    state = [0] * 25
    for i in range(0, len(padded), r):
        block = padded[i:i+r]
        for j in range(len(block) // 8):
            state[j] ^= int.from_bytes(block[j*8:(j+1)*8], "little")
        for round_idx in range(24):
            C = [state[x] ^ state[x+5] ^ state[x+10] ^ state[x+15] ^ state[x+20] for x in range(5)]
            D = [C[(x+4)%5] ^ (((C[(x+1)%5] << 1) & 0xFFFFFFFFFFFFFFFF) | (C[(x+1)%5] >> 63)) for x in range(5)]
            for x in range(5):
                for y in range(5):
                    state[x + y*5] ^= D[x]
            rotations = [
                0, 1, 62, 28, 27, 36, 44, 6, 55, 20,
                3, 10, 43, 25, 39, 41, 45, 15, 21, 8,
                18, 2, 61, 56, 14
            ]
            pi_map = [
                0, 10, 20, 5, 15, 16, 1, 11, 21, 6,
                7, 17, 2, 12, 22, 23, 8, 18, 3, 13,
                14, 24, 9, 19, 4
            ]
            B = [0] * 25
            for idx in range(25):
                rot = rotations[idx]
                val = state[idx]
                B[pi_map[idx]] = ((val << rot) & 0xFFFFFFFFFFFFFFFF) | (val >> (64 - rot)) if rot else val
            for y in range(5):
                for x in range(5):
                    state[x + y*5] = B[x + y*5] ^ ((~B[(x+1)%5 + y*5]) & B[(x+2)%5 + y*5])
            state[0] ^= RC[round_idx]
    out = bytearray()
    for s in state[:4]:
        out.extend(s.to_bytes(8, "little"))
    return bytes(out)


def _base58check(raw_21: bytes) -> str:
    h = hashlib.sha256(hashlib.sha256(raw_21).digest()).digest()[:4]
    full = raw_21 + h
    n = int.from_bytes(full, "big")
    res = []
    while n > 0:
        n, m = divmod(n, 58)
        res.append(BASE58_ALPHABET[m])
    for b in full:
        if b == 0:
            res.append(BASE58_ALPHABET[0])
        else:
            break
    return "".join(reversed(res))


def _derive_child_key(parent_key: bytes, parent_chain_code: bytes, index: int, hardened: bool = False):
    idx = index + (0x80000000 if hardened else 0)
    if hardened:
        data = b"\x00" + parent_key + struct.pack(">I", idx)
    else:
        priv_num = int.from_bytes(parent_key, "big")
        priv_key = ec.derive_private_key(priv_num, ec.SECP256K1(), default_backend())
        pub_bytes = priv_key.public_key().public_bytes(
            encoding=serialization.Encoding.X962,
            format=serialization.PublicFormat.CompressedPoint
        )
        data = pub_bytes + struct.pack(">I", idx)

    I = hmac.new(parent_chain_code, data, hashlib.sha512).digest()
    IL, IR = I[:32], I[32:]
    child_key = (int.from_bytes(IL, "big") + int.from_bytes(parent_key, "big")) % CURVE_ORDER
    return child_key.to_bytes(32, "big"), IR


def _mnemonic_to_seed(mnemonic: str, passphrase: str = "") -> bytes:
    mnemonic_clean = clean_string(mnemonic).strip()
    return hashlib.pbkdf2_hmac("sha512", mnemonic_clean.encode("utf-8"), ("mnemonic" + passphrase).encode("utf-8"), 2048, 64)


def get_configured_mnemonic() -> str:
    m = clean_string(getattr(settings, "DEPOSIT_HD_MNEMONIC", ""))
    return m if m else DEFAULT_DEV_HD_MNEMONIC


def derive_tron_keypair(index: int, mnemonic: str = None) -> dict:
    """Derives BIP-44 TRON keypair for path m/44'/195'/0'/0/index."""
    mnemo = mnemonic or get_configured_mnemonic()
    seed = _mnemonic_to_seed(mnemo)
    master = hmac.new(b"Bitcoin seed", seed, hashlib.sha512).digest()
    k, c = master[:32], master[32:]

    # m/44'/195'/0'/0/index
    k, c = _derive_child_key(k, c, 44, hardened=True)
    k, c = _derive_child_key(k, c, TRON_COIN_TYPE, hardened=True)
    k, c = _derive_child_key(k, c, 0, hardened=True)
    k, c = _derive_child_key(k, c, 0, hardened=False)
    k_idx, _ = _derive_child_key(k, c, index, hardened=False)

    priv_hex = k_idx.hex()
    priv_num = int.from_bytes(k_idx, "big")
    priv_key = ec.derive_private_key(priv_num, ec.SECP256K1(), default_backend())
    pub_uncompressed = priv_key.public_key().public_bytes(
        encoding=serialization.Encoding.X962,
        format=serialization.PublicFormat.UncompressedPoint
    )[1:]  # 64 bytes

    k_hash = _keccak_256(pub_uncompressed)
    raw_21 = b"\x41" + k_hash[-20:]
    tron_address = _base58check(raw_21)

    return {
        "index": index,
        "tron_address": tron_address,
        "private_key": priv_hex,
        "path": f"m/44'/195'/0'/0/{index}",
    }


def derive_evm_keypair(index: int, mnemonic: str = None) -> dict:
    """Derives BIP-44 EVM (BEP20 / ERC20) keypair for path m/44'/60'/0'/0/index."""
    mnemo = mnemonic or get_configured_mnemonic()
    seed = _mnemonic_to_seed(mnemo)
    master = hmac.new(b"Bitcoin seed", seed, hashlib.sha512).digest()
    k, c = master[:32], master[32:]

    # m/44'/60'/0'/0/index
    k, c = _derive_child_key(k, c, 44, hardened=True)
    k, c = _derive_child_key(k, c, EVM_COIN_TYPE, hardened=True)
    k, c = _derive_child_key(k, c, 0, hardened=True)
    k, c = _derive_child_key(k, c, 0, hardened=False)
    k_idx, _ = _derive_child_key(k, c, index, hardened=False)

    priv_hex = k_idx.hex()
    priv_num = int.from_bytes(k_idx, "big")
    priv_key = ec.derive_private_key(priv_num, ec.SECP256K1(), default_backend())
    pub_uncompressed = priv_key.public_key().public_bytes(
        encoding=serialization.Encoding.X962,
        format=serialization.PublicFormat.UncompressedPoint
    )[1:]  # 64 bytes

    k_hash = _keccak_256(pub_uncompressed)
    evm_address = _to_checksum_address(k_hash[-20:].hex())

    return {
        "index": index,
        "address": evm_address,
        "evm_address": evm_address,
        "private_key": priv_hex,
        "path": f"m/44'/60'/0'/0/{index}",
    }


def get_or_create_user_deposit_address(user_id: str, network: str = "TRC20") -> str:
    """Gets or assigns a unique deterministic HD deposit address for the user on TRC20, BEP20, or ERC20."""
    user_id_str = str(user_id)
    network = clean_string(network).upper() or "TRC20"

    db = get_database()
    addr_col = db.user_deposit_addresses

    # Check if already assigned
    existing = addr_col.find_one({"user_id": user_id_str, "network": network})
    if existing and existing.get("address"):
        return existing.get("address")

    # Allocate next index atomically
    counters = db.system_counters
    counter = counters.find_one_and_update(
        {"_id": f"hd_index_{network}"},
        {"$inc": {"seq": 1}},
        upsert=True,
        return_document=True
    )
    assigned_index = int(counter.get("seq", 1))

    if network in ("BEP20", "ERC20"):
        derived = derive_evm_keypair(assigned_index)
        address = derived["address"]
    else:
        derived = derive_tron_keypair(assigned_index)
        address = derived["tron_address"]

    addr_col.update_one(
        {"user_id": user_id_str, "network": network},
        {
            "$set": {
                "user_id": user_id_str,
                "network": network,
                "address": address,
                "index": assigned_index,
                "path": derived["path"],
            }
        },
        upsert=True
    )

    return address


def find_user_by_deposit_address(address: str, network: str = "TRC20"):
    """Looks up the owner user_id for a given on-chain deposit address (case-insensitive safe)."""
    import re
    clean_addr = clean_string(address)
    if not clean_addr:
        return None

    db = get_database()
    net = clean_string(network).upper() or "TRC20"
    # Try exact match first
    rec = db.user_deposit_addresses.find_one({
        "address": clean_addr,
        "network": net
    })
    if rec:
        return rec

    # Fallback to case-insensitive match
    return db.user_deposit_addresses.find_one({
        "address": {"$regex": f"^{re.escape(clean_addr)}$", "$options": "i"},
        "network": net
    })

