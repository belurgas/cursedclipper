use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};

mod commands;
mod core_types;
mod database;
mod mock;

use core_types::*;
use database::*;
use mock::*;

pub use commands::*;
