export function Footer() {
  return (
    <footer
      className="border-t-8 border-[#8b7355] bg-[#1b120d] px-8 py-8"
      style={{ boxShadow: '0 -4px 12px rgba(0,0,0,0.5)' }}
    >
      <div className="mx-auto max-w-4xl space-y-3 text-center font-mono text-sm text-[#f5e6d3]">
        <div className="flex flex-wrap justify-center gap-x-4 gap-y-1">
          <a className="underline hover:opacity-80" href="https://landonjsmith.com/hcfaqs">
            Frequently Asked Questions
          </a>
          <span className="text-[#8b7355]">|</span>
          <span>
            Questions? Comments?{' '}
            <a className="underline hover:opacity-80" href="mailto:landon@producerjason.com">
              Email Me!
            </a>
          </span>
        </div>

        <p>All rights to the original Apple-1 software and hardware belong to Apple Inc.</p>
        <p>
          This site and emulator are <strong>not affiliated</strong> with Apple Inc.
        </p>
        <p>WOZMON/Integer BASIC were originally written in 1976 by Steve Wozniak.</p>
        <p>
          Special thanks to{' '}
          <a className="underline hover:opacity-80" href="https://sbprojects.net" target="_blank" rel="noreferrer">
            San Bergmans
          </a>{' '}
          and{' '}
          <a
            className="underline hover:opacity-80"
            href="https://github.com/whscullin/apple1js"
            target="_blank"
            rel="noreferrer"
          >
            whscullin
          </a>
          . Their documentation on the APPLE-1 was very helpful in the creation of this emulator.
          Be sure to check them out!
        </p>
        <p>
          Powered by the MOSe Emulation Core:{' '}
          <a
            className="underline hover:opacity-80"
            href="https://github.com/landonjsmith/MOSe"
            target="_blank"
            rel="noreferrer"
          >
            by Landon J. Smith.
          </a>
        </p>
      </div>
    </footer>
  );
}
