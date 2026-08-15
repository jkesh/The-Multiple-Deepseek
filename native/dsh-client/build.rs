fn main() {
    #[cfg(windows)]
    {
        let mut resource = winres::WindowsResource::new();
        resource.set_icon("assets/icon.ico");
        resource.compile().expect("embedding the exe icon failed");
    }
}
