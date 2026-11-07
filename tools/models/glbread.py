import json, struct, numpy as np
CT={5120:np.int8,5121:np.uint8,5122:np.int16,5123:np.uint16,5125:np.uint32,5126:np.float32}
NC={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}
def load(path):
    b=open(path,'rb').read(); L=struct.unpack('<I',b[12:16])[0]; J=json.loads(b[20:20+L]); o=20+L
    bl=struct.unpack('<I',b[o:o+4])[0]; bin_=b[o+8:o+8+bl]
    def acc(i):
        a=J['accessors'][i]; v=J['bufferViews'][a['bufferView']]; dt=CT[a['componentType']]; n=NC[a['type']]
        off=v.get('byteOffset',0)+a.get('byteOffset',0); st=v.get('byteStride')
        isz=np.dtype(dt).itemsize*n
        if st and st!=isz:
            raw=np.frombuffer(bin_,np.uint8,count=st*a['count'],offset=off).reshape(a['count'],st)[:,:isz].copy()
            arr=raw.view(dt).reshape(a['count'],n)
        else: arr=np.frombuffer(bin_,dt,count=a['count']*n,offset=off).reshape(a['count'],n)
        if a.get('normalized'): arr=arr.astype(np.float32)/np.iinfo(dt).max
        return arr
    return J,bin_,acc
