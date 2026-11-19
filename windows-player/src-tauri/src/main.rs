#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::net::TcpStream;
use std::path::PathBuf;
use std::process::{Child, Command};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use tauri::{Manager, RunEvent, WebviewUrl, WebviewWindowBuilder};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

/// Yan süreç olarak çalışan yerel sunucu (server.js / voxen-server.exe).
struct SidecarProcess(Mutex<Option<Child>>);

/// Electron preload'inin yerini alan köprü. Arayüzdeki `window.voxenDesktop`
/// beklentisini Tauri pencere komutlarına çevirir; sayfa her yüklendiğinde
/// yeniden enjekte edilir.
const BRIDGE_SCRIPT: &str = r#"(function () {
  function invoke(name) {
    var internals = window.__TAURI_INTERNALS__;
    if (!internals) return;
    try { internals.invoke('plugin:window|' + name, { label: 'main' }); }
    catch (error) { console.warn('[voxen] pencere komutu başarısız:', error); }
  }
  if (!window.voxenDesktop) {
    Object.defineProperty(window, 'voxenDesktop', {
      value: {
        windowAction: function (action) {
          if (action === 'minimize') invoke('minimize');
          else if (action === 'maximize') invoke('toggle_maximize');
          else if (action === 'close') invoke('close');
        }
      },
      configurable: false,
    });
  }
})();"#;

/// Yerel sunucuyu (ses çözümleyici + statik arayüz) yan süreç olarak başlatır.
///
/// Dev derlemesinde `node server.js` çalışır; release derlemesinde paketle
/// birlikte gelen `voxen-server.exe` kullanılır. Sunucuya geçirilen origin
/// Electron döneminden (http://127.0.0.1:48731) aynı kalır; böylece Firebase
/// oturumları ve tarayıcı deposundaki veriler bozulmaz.
fn spawn_server(app: &tauri::AppHandle) -> tauri::Result<Child> {
    let port = std::env::var("VOXEN_PLAYER_PORT").unwrap_or_else(|_| "48731".to_string());

    let player_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .expect("windows-player klasörü bulunamadı")
        .to_path_buf();

    let (web_root, program, args): (PathBuf, String, Vec<String>) = if cfg!(debug_assertions) {
        let root = player_dir
            .parent()
            .expect("proje kökü bulunamadı")
            .join("dist-windows");
        let script = player_dir.join("server.js");
        (
            root,
            "node".to_string(),
            vec![script.to_string_lossy().to_string()],
        )
    } else {
        let resource_dir = app.path().resource_dir()?;
        (
            resource_dir.join("web"),
            resource_dir
                .join("voxen-server.exe")
                .to_string_lossy()
                .to_string(),
            Vec::new(),
        )
    };

    let data_root = app.path().app_data_dir()?.join("media");
    std::fs::create_dir_all(&data_root)?;

    let mut command = Command::new(&program);
    command
        .args(&args)
        .stdin(std::process::Stdio::piped())
        .env("VOXEN_PLAYER_PORT", &port)
        .env("VOXEN_WEB_ROOT", &web_root)
        .env("VOXEN_DATA_ROOT", &data_root);
    #[cfg(windows)]
    command.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    command
        .spawn()
        .map_err(|error| tauri::Error::Io(std::io::Error::other(error)))
}

/// Sunucunun bağlantı kabul etmesini bekler (InnerTube başlatma maliyeti var).
fn wait_for_server(port: u16) -> Result<(), String> {
    let deadline = Instant::now() + Duration::from_secs(45);
    loop {
        if TcpStream::connect(("127.0.0.1", port)).is_ok() {
            return Ok(());
        }
        if Instant::now() > deadline {
            return Err("Yerel Voxen sunucusu zamanında başlatılamadı".to_string());
        }
        std::thread::sleep(Duration::from_millis(150));
    }
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .setup(|app| {
            let port: u16 = std::env::var("VOXEN_PLAYER_PORT")
                .unwrap_or_else(|_| "48731".to_string())
                .parse()
                .unwrap_or(48731);

            let child = spawn_server(&app.handle())?;
            app.manage(SidecarProcess(Mutex::new(Some(child))));
            wait_for_server(port)?;

            let origin: tauri::Url = format!("http://127.0.0.1:{port}").parse()?;

            let window = WebviewWindowBuilder::new(app, "main", WebviewUrl::External(origin))
                .title("Voxen")
                .inner_size(1440.0, 900.0)
                .min_inner_size(1024.0, 640.0)
                .decorations(false)
                .center()
                .visible(true)
                .initialization_script(BRIDGE_SCRIPT)
                .on_navigation(move |url| {
                    if url.scheme() == "http" || url.scheme() == "https" {
                        if let Some(host) = url.host_str() {
                            if host == "127.0.0.1" || host == "localhost" {
                                return true;
                            }
                        }
                        let _ = open::that(url.as_str());
                        return false;
                    }
                    true
                })
                .build()?;
            println!("[Voxen] Pencere oluşturuldu, gösteriliyor...");
            let _ = window.show();
            let _ = window.set_focus();
            let _ = window.maximize();
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("Voxen başlatılamadı")
        .run(|app, event| {
            if let RunEvent::Exit = event {
                if let Some(mut child) = app.state::<SidecarProcess>().0.lock().unwrap().take() {
                    let _ = child.kill();
                }
            }
        });
}
