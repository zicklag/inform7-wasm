/* Stubs for POSIX functions not available in WASI */
#include <stddef.h>
#include <time.h>

/* Thread stubs — inform7 declares these but never calls them */
int pthread_create(void *thread, const void *attr, void *(*start)(void *), void *arg) { return 0; }
int pthread_join(void *thread, void **retval) { return 0; }
int pthread_attr_init(void *attr) { return 0; }
int pthread_attr_setstacksize(void *attr, size_t stacksize) { return 0; }
int pthread_attr_getstacksize(void *attr, size_t *stacksize) { *stacksize = 65536; return 0; }

/* Mutex stubs — used in memory allocator but never contended */
int pthread_mutex_lock(void *mutex) { return 0; }
int pthread_mutex_unlock(void *mutex) { return 0; }

/* C library stubs */
int system(const char *cmd) { return -1; }  /* Return error */
clock_t clock(void) { return (clock_t)-1; }  /* Return error */
