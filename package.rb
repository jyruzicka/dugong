require "uglifier"

str = Uglifier.new.compile(File.read "dugong.js")
File.open("dugong-min.js","w"){ |io| io.puts str }