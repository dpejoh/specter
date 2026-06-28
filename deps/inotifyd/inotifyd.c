#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>
#include <sys/inotify.h>
#include <sys/wait.h>
#include <signal.h>
#include <errno.h>

#define EVENT_SIZE (sizeof(struct inotify_event))
#define BUF_LEN (1024 * (EVENT_SIZE + 16))

static volatile int keep_running = 1;

static void handle_signal(int sig) {
    (void)sig;
    keep_running = 0;
}

int main(int argc, char *argv[]) {
    if (argc != 3) {
        fprintf(stderr, "Usage: %s <watch_dir> <handler_script>\n", argv[0]);
        return 1;
    }

    const char *watch_dir = argv[1];
    const char *handler = argv[2];

    signal(SIGCHLD, SIG_IGN);
    signal(SIGTERM, handle_signal);
    signal(SIGINT, handle_signal);

    int fd = inotify_init1(IN_CLOEXEC);
    if (fd < 0) {
        perror("inotify_init1");
        return 1;
    }

    int wd = inotify_add_watch(fd, watch_dir, IN_CREATE | IN_DELETE | IN_ONLYDIR);
    if (wd < 0) {
        perror("inotify_add_watch");
        close(fd);
        return 1;
    }

    char buf[BUF_LEN];

    while (keep_running) {
        ssize_t len = read(fd, buf, BUF_LEN);
        if (len < 0) {
            if (errno == EINTR) continue;
            break;
        }

        sleep(2);

        pid_t pid = fork();
        if (pid < 0) continue;
        if (pid == 0) {
            execl("/system/bin/sh", "sh", handler, NULL);
            _exit(127);
        }
    }

    close(wd);
    close(fd);
    return 0;
}
