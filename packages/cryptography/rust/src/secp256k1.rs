use k256::ecdsa::signature::hazmat::{PrehashSigner, PrehashVerifier};
use k256::ecdsa::signature::{Signer, Verifier};
use k256::ecdsa::{Signature, SigningKey, VerifyingKey};
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn get_public_key(private_key: &[u8]) -> Result<Vec<u8>, JsError> {
    let signing_key =
        SigningKey::from_slice(private_key).map_err(|error| JsError::new(&error.to_string()))?;

    Ok(signing_key
        .verifying_key()
        .to_sec1_point(true)
        .as_bytes()
        .to_vec())
}

#[wasm_bindgen]
pub fn sign(private_key: &[u8], data: &[u8]) -> Result<Vec<u8>, JsError> {
    let signing_key =
        SigningKey::from_slice(private_key).map_err(|error| JsError::new(&error.to_string()))?;
    let signature: Signature = signing_key.sign(data);
    Ok(signature.to_bytes().to_vec())
}

#[wasm_bindgen]
pub fn verify(public_key: &[u8], signature: &[u8], data: &[u8]) -> bool {
    let Ok(verifying_key) = VerifyingKey::from_sec1_bytes(public_key) else {
        return false;
    };
    let Ok(signature) = Signature::from_slice(signature) else {
        return false;
    };
    verifying_key.verify(data, &signature).is_ok()
}

#[wasm_bindgen]
pub fn sign_prehash(private_key: &[u8], data: &[u8]) -> Result<Vec<u8>, JsError> {
    let signing_key =
        SigningKey::from_slice(private_key).map_err(|error| JsError::new(&error.to_string()))?;
    let signature: Signature = signing_key
        .sign_prehash(data)
        .map_err(|error| JsError::new(&error.to_string()))?;
    Ok(signature.to_bytes().to_vec())
}

#[wasm_bindgen]
pub fn verify_prehash(public_key: &[u8], signature: &[u8], data: &[u8]) -> bool {
    let Ok(verifying_key) = VerifyingKey::from_sec1_bytes(public_key) else {
        return false;
    };
    let Ok(signature) = Signature::from_slice(signature) else {
        return false;
    };
    verifying_key.verify_prehash(data, &signature).is_ok()
}
