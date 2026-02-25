class Redpather < Formula
  desc "Ultimate Mobile Automation Tool with AI support"
  homepage "https://github.com/selimerdinc/redPather"
  url "https://github.com/selimerdinc/redPather/releases/download/v1.3.0/RedPather-v1.3.0-macOS.zip"
  sha256 "e8b73719a71ce417a3d054a85a0d93044bad52168497ed2c42ee466d01be1a75"
  license "MIT"

  depends_on "node"
  depends_on "python@3.10"

  def install
    # Binary'yi /usr/local/bin veya /opt/homebrew/bin altına semlink yapar
    libexec.install Dir["*"]
    bin.install_symlink libexec/"RedPather.app/Contents/MacOS/RedPather" => "redpather"
  end

  test do
    system "#{bin}/redpather", "--version"
  end
end
