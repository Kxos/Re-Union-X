import sys,struct
f=open(sys.argv[1],'rb'); d=f.read(64)
cls={1:'ELF32',2:'ELF64'}[d[4]]; endi={1:'LE',2:'BE'}[d[5]]
machine=struct.unpack_from('<H',d,18)[0]
mach={3:'x86',40:'ARM',62:'x86-64',183:'AARCH64'}.get(machine,str(machine))
print(f"{sys.argv[1]}: {cls} {endi} machine={mach}")
