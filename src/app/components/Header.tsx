export function Header() {
  return (
    <header
      className="border-b-8 border-[#8b7355] px-8 py-3"
      style={{
        boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
        background: 'linear-gradient(180deg, #d4c5a9 0%, #c4b399 100%)',
      }}
    >
      <div className="max-w-6xl mx-auto text-center relative">
        <div className="absolute bottom-0 flex flex-wrap justify-center gap-x-4 gap-y-1">
          <a className="underline hover:opacity-80" href="https://landonjsmith.com/">
            Home
          </a>
          <a className="underline hover:opacity-80" href="https://soundcloud.com/therealsjl">
            My Music
          </a>
          <a className="underline hover:opacity-80" href="https://youtube.com/@landonjsmith">
            My Videos
          </a>
        </div>
        <div className="absolute bottom-0 right-0 text-right">
          <div>HoneyCrisp v1.2.9 | © 2026 Landon J. Smith</div>
        </div>
        <div
          className="inline-flex flex-col items-center gap-3 border-8 border-[#8b7355] bg-[#2a1810] px-4 py-1"
          style={{ boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.5), 0 6px 16px rgba(0,0,0,0.4)' }}
        >
          <img
            src="/hclogo.png"
            alt="HONEYCRISP EMULATOR"
            className="h-auto w-40 max-w-full md:w-48 sepia-50"
          />
        </div>
      </div>
    </header>
  );
}
