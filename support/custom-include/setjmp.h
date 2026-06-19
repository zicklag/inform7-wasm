/* Custom setjmp.h that doesn't error on WASM */
typedef int jmp_buf[1];
int setjmp(jmp_buf env);
void longjmp(jmp_buf env, int val);
